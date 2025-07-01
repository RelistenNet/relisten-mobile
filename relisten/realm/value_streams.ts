import Realm, { AnyRealmObject } from 'realm';
import { CollectionCallback } from '@realm/react/src/helpers';
import { createCachedObject } from '@realm/react/src/cachedObject';
import { createCachedCollection } from '@realm/react/src/cachedCollection';

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
      this.listeners = this.listeners.splice(this.listeners.indexOf(listener), 1);
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

  constructor(
    private resultsA: ValueStream<A>,
    private resultsB: ValueStream<B>,
    private transform: (a: A, b: B) => T
  ) {
    super();

    this.resultsA.addListener(() => this.executeTransform());
    this.resultsB.addListener(() => this.executeTransform());

    this.executeTransform();
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
