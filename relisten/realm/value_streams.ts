import Realm, { AnyRealmObject } from 'realm';
import { CollectionCallback } from '@realm/react/src/helpers';
import { createCachedObject } from '@realm/react/src/cachedObject';
import { createCachedCollection } from '@realm/react/src/cachedCollection';
import { CatalogRetirementState } from '@/relisten/realm/catalog_retirement_schema';
import {
  readActiveCatalogObject,
  readRetainedCatalogObject,
} from '@/relisten/realm/catalog_retirement';

export abstract class ValueStream<T> {
  protected listeners: ((nextValue: T) => void)[] = [];
  public abstract currentValue: T;

  protected emitCurrentValue() {
    for (const listener of this.listeners) {
      listener(this.currentValue);
    }
  }

  tearDown() {
    this.listeners = [];
  }

  addListener(listener: (nextValue: T) => void): () => void {
    this.listeners.push(listener);

    // Should this be synchronous?
    listener(this.currentValue);

    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx === -1) {
        return;
      }

      this.listeners.splice(idx, 1);
    };
  }
}

export class EmittableValueStream<T> extends ValueStream<T> {
  public currentValue: T;

  public constructor(firstValue: T) {
    super();

    this.currentValue = firstValue;
  }

  public emit(newValue: T) {
    this.currentValue = newValue;
    this.emitCurrentValue();
  }
}

export class CombinedValueStream<T, A, B> extends ValueStream<T> {
  public currentValue!: T;
  private readonly tearDownA: () => void;
  private readonly tearDownB: () => void;

  constructor(
    private resultsA: ValueStream<A>,
    private resultsB: ValueStream<B>,
    private transform: (a: A, b: B) => T
  ) {
    super();

    this.tearDownA = this.resultsA.addListener(() => this.executeTransform());
    this.tearDownB = this.resultsB.addListener(() => this.executeTransform());

    this.executeTransform();
  }

  override tearDown() {
    super.tearDown();
    this.tearDownA();
    this.tearDownB();
    this.resultsA.tearDown();
    this.resultsB.tearDown();
  }

  private executeTransform() {
    this.currentValue = this.transform(this.resultsA.currentValue, this.resultsB.currentValue);
    this.emitCurrentValue();
  }
}

export class RealmQueryValueStream<T extends AnyRealmObject> extends ValueStream<Realm.Results<T>> {
  private readonly cachedCollectionTearDown: () => void;
  public currentValue: Realm.Results<T>;

  constructor(
    realm: Realm.Realm,
    private collection: Realm.Results<T>
  ) {
    super();

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;

    const { collection: cachedCollection, tearDown } = createCachedCollection<T>({
      collection,
      realm,
      // Re-emit the same value without changes when only a sub-object changed
      updateCallback: () => this.emitCurrentValue(),
      updatedRef: {
        set current(newValue) {
          if (newValue) {
            // create a new proxy when necessary
            that.currentValue = new Proxy(that.collection, {});
            that.emitCurrentValue();
          }
        },
        get current() {
          // creating the new reference is always immediate
          return false;
        },
      },
    });

    this.cachedCollectionTearDown = tearDown;
    this.currentValue = new Proxy(cachedCollection as Realm.Results<T>, {});
    this.emitCurrentValue();
  }

  tearDown() {
    super.tearDown();
    this.cachedCollectionTearDown();
  }
}

export class RetainedCatalogResultsValueStream<
  T extends AnyRealmObject & CatalogRetirementState & { uuid: string },
> extends ValueStream<Realm.Results<T>> {
  public currentValue: Realm.Results<T>;
  private readonly resultsStream: RealmQueryValueStream<T>;
  private readonly tearDownResultsListener: () => void;

  constructor(
    realm: Realm.Realm,
    collection: Realm.Results<T>,
    private readonly accessSite: string
  ) {
    super();

    this.resultsStream = new RealmQueryValueStream(realm, collection);
    this.currentValue = this.resultsStream.currentValue;
    this.reportRetainedMembers();

    let addingListener = true;
    this.tearDownResultsListener = this.resultsStream.addListener((results) => {
      // The subscription synchronously replays the value that was reported above.
      if (addingListener) return;

      this.currentValue = results;
      this.reportRetainedMembers();
      this.emitCurrentValue();
    });
    addingListener = false;
  }

  override tearDown() {
    super.tearDown();
    this.tearDownResultsListener();
    this.resultsStream.tearDown();
  }

  private reportRetainedMembers() {
    for (const object of this.currentValue.filtered('retiredAt != nil')) {
      readRetainedCatalogObject(object, this.accessSite);
    }
  }
}

class RealmSingleResultValueStream<T extends AnyRealmObject> extends ValueStream<T | null> {
  public currentValue: T | null;
  private readonly resultsStream: RealmQueryValueStream<T>;
  private readonly tearDownResultsListener: () => void;

  constructor(
    realm: Realm.Realm,
    query: Realm.Results<T>,
    private readonly resolveCurrentObject: (results: Realm.Results<T>) => T | null = (results) =>
      results[0] ?? null
  ) {
    super();

    this.resultsStream = new RealmQueryValueStream(realm, query);
    this.currentValue = this.resolveCurrentObject(this.resultsStream.currentValue);
    let addingListener = true;
    this.tearDownResultsListener = this.resultsStream.addListener((results) => {
      // ValueStream subscriptions synchronously replay their current value. The value above is
      // already resolved, and retained resolvers have access-reporting side effects.
      if (addingListener) return;

      this.currentValue = this.resolveCurrentObject(results);
      this.emitCurrentValue();
    });
    addingListener = false;
  }

  override tearDown() {
    super.tearDown();
    this.tearDownResultsListener();
    this.resultsStream.tearDown();
  }
}

export class ActiveCatalogObjectValueStream<
  T extends AnyRealmObject & CatalogRetirementState & { uuid: string },
> extends RealmSingleResultValueStream<T> {
  constructor(
    realm: Realm.Realm,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: string | (new (...args: any) => T),
    uuid: string,
    accessSite: string
  ) {
    super(realm, realm.objects<T>(type as never).filtered('uuid == $0', uuid), (results) => {
      return readActiveCatalogObject(results[0], accessSite) ?? null;
    });
  }
}

export class RetainedCatalogObjectValueStream<
  T extends AnyRealmObject & CatalogRetirementState & { uuid: string },
> extends RealmSingleResultValueStream<T> {
  constructor(
    realm: Realm.Realm,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: string | (new (...args: any) => T),
    uuid: string,
    accessSite: string
  ) {
    super(realm, realm.objects<T>(type as never).filtered('uuid == $0', uuid), (results) => {
      return readRetainedCatalogObject(results[0], accessSite) ?? null;
    });
  }
}

// Source: https://github.com/realm/realm-js/blob/8ccb12092fbe22480e4039ca125f43c5199b2a2e/packages/realm-react/src/useObject.tsx#L213
// Apache License 2.0
function arePrimaryKeysIdentical(a: unknown, b: unknown): boolean {
  // This is a helper function that determines if two primary keys are equal.  It will also handle the case where the primary key is an ObjectId or UUID
  if (typeof a !== typeof b) {
    return false;
  }
  if (typeof a === 'string' || typeof a === 'number') {
    return a === b;
  }
  if (a instanceof Realm.BSON.ObjectId && b instanceof Realm.BSON.ObjectId) {
    return a.toHexString() === b.toHexString();
  }
  if (a instanceof Realm.BSON.UUID && b instanceof Realm.BSON.UUID) {
    return a.toHexString() === b.toHexString();
  }
  return false;
}

export class RealmObjectValueStream<T extends AnyRealmObject> extends ValueStream<T | null> {
  private cachedObjectTearDown: (() => void) | undefined = undefined;
  private collectionListenerTearDown: (() => void) | undefined = undefined;
  public currentValue: T | null = null;

  constructor(
    private realm: Realm.Realm,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private type: string | (new (...args: any) => T),
    private primaryKey: T[keyof T]
  ) {
    super();

    const originalObject = realm.objectForPrimaryKey<T>(type as never, primaryKey);

    if (originalObject) {
      this.setupCachedObject(originalObject);
    } else {
      this.setupCollectionListener();
    }
  }

  private setupCollectionListener() {
    const collection = this.realm.objects(this.type as never);

    const collectionListener: CollectionCallback = (_, changes) => {
      const primaryKeyProperty = collection?.[0]?.objectSchema()?.primaryKey;

      for (const index of changes.insertions) {
        const object = collection[index];
        if (primaryKeyProperty) {
          const insertedPrimaryKey = object[primaryKeyProperty];
          if (arePrimaryKeysIdentical(insertedPrimaryKey, this.primaryKey)) {
            this.currentValue = object as T;
            this.setupCachedObject(object as T);

            this.emitCurrentValue();

            collection.removeListener(collectionListener);
            break;
          }
        }
      }
    };

    collection.addListener(collectionListener);

    this.collectionListenerTearDown = () => {
      // If the app is closing, the realm will be closed and the listener does not need to be removed if
      if (!this.realm.isClosed && collection) {
        collection.removeListener(collectionListener);
      }
    };
  }

  private setupCachedObject(originalObject: T) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;

    const { object: cachedObject, tearDown } = createCachedObject({
      object: originalObject,
      realm: this.realm,
      // Re-emit the same value without changes when only a sub-object changed
      updateCallback: () => this.emitCurrentValue(),
      updatedRef: {
        set current(newValue) {
          if (newValue) {
            // create a new proxy when necessary
            that.currentValue = new Proxy(originalObject, {});
            that.emitCurrentValue();
          }
        },
        get current() {
          // creating the new reference is always immediate
          return false;
        },
      },
    });

    this.cachedObjectTearDown = tearDown;
    this.currentValue = new Proxy(cachedObject as T, {});
    this.emitCurrentValue();
  }

  tearDown() {
    super.tearDown();

    if (this.cachedObjectTearDown) {
      this.cachedObjectTearDown();
    }

    if (this.collectionListenerTearDown) {
      this.collectionListenerTearDown();
    }
  }
}
