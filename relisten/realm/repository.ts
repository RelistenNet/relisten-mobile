import Realm from 'realm';
import { RelistenObjectRequiredProperties } from './relisten_object';
import dayjs from 'dayjs';
import * as R from 'remeda';
import { log } from '../util/logging';

const logger = log.extend('repo');

interface ModelClass<TModel, TApi, RequiredProperties, RequiredRelationships> {
  new (realm: Realm, props: RequiredProperties): TModel;
  propertiesFromApi(relistenObj: TApi): RequiredProperties;
  relationshipsFromApi?(relistenObj: TApi): RequiredRelationships;
  schema: Realm.ObjectSchema;
}

export interface RelistenApiUpdatableObject {
  uuid: string;
  updated_at: string;
}

export interface UpsertResults<T> {
  created: number;
  updated: number;
  deleted: number;
  updatedModels: T[];
  createdModels: T[];
}

function combinedUpsertResults<T>(acc: UpsertResults<T>, b: UpsertResults<T>): UpsertResults<T> {
  acc.created += b.created;
  acc.updated += b.updated;
  acc.deleted += b.deleted;
  acc.updatedModels.push(...b.updatedModels);
  acc.createdModels.push(...b.createdModels);

  return acc;
}

function humanizeUpsertResults(a: UpsertResults<unknown>) {
  return `created=${a.created}, updated=${a.updated}, deleted=${a.deleted}`;
}

function getUpdatedAt<T extends { updated_at: string }>(obj: T): dayjs.Dayjs {
  const cacheKey = 'updated_at__dayjs';

  if (cacheKey in obj) {
    return (obj as any)[cacheKey];
  }

  const parsed = dayjs(obj.updated_at);
  (obj as any)[cacheKey] = parsed;

  return parsed;
}

export class Repository<
  TModel extends RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object,
> {
  constructor(private klass: ModelClass<TModel, TApi, RequiredProperties, RequiredRelationships>) {}

  public updateObjectFromApi(realm: Realm, model: TModel, relistenObj: TApi): TModel {
    const p = this.klass.propertiesFromApi(relistenObj);
    const r = this.klass.relationshipsFromApi
      ? this.klass.relationshipsFromApi(relistenObj)
      : undefined;

    for (const [prop, value] of Object.entries(p) as [
      keyof RequiredProperties,
      RequiredProperties[keyof RequiredProperties],
    ][]) {
      (model as any)[prop] = value;
    }

    if (r) {
      for (const [prop, value] of Object.entries(r) as [
        keyof RequiredRelationships,
        RequiredRelationships[keyof RequiredRelationships],
      ][]) {
        (model as any)[prop] = value;
      }
    }

    return model;
  }

  public upsert(
    realm: Realm,
    api: TApi,
    model: TModel | undefined,
    queryForModel = false
  ): UpsertResults<TModel> {
    const writeHandler = () => this.upsertWithinWrite(realm, api, model, queryForModel);

    let res: UpsertResults<TModel>;

    if (realm.isInTransaction) {
      res = writeHandler();
    } else {
      res = realm.write(() => {
        return writeHandler();
      });
    }

    logger.info(
      'upsert for',
      this.klass.schema.name,
      `uuid=${api.uuid}, ${humanizeUpsertResults(res)}`
    );

    return res;
  }

  private upsertWithinWrite(
    realm: Realm,
    api: TApi,
    model: TModel | undefined,
    queryForModel = false
  ): UpsertResults<TModel> {
    if (queryForModel && !model) {
      model = realm.objectForPrimaryKey(this.klass, api.uuid) || undefined;
    }

    if (model) {
      if (getUpdatedAt(api).toDate() > model.updatedAt) {
        this.updateObjectFromApi(realm, model, api);

        return { created: 0, updated: 1, deleted: 0, updatedModels: [model], createdModels: [] };
      }

      return { created: 0, updated: 0, deleted: 0, createdModels: [], updatedModels: [] };
    } else {
      const newModel = this.realmObjectFromApi(realm, api);

      return { created: 1, updated: 0, deleted: 0, createdModels: [newModel], updatedModels: [] };
    }
  }

  public upsertMultiple(
    realm: Realm,
    api: ReadonlyArray<TApi>,
    models: ReadonlyArray<TModel> | Realm.List<TModel> | Realm.Results<TModel>
  ): UpsertResults<TModel> {
    const dbIds = models.map((m) => m.uuid);
    const networkUuids = api.map((a) => a.uuid);

    const dbIdsToRemove = R.difference(dbIds, networkUuids);
    const networkUuidsToUpsert = R.difference(networkUuids, dbIds).concat(
      R.intersection(dbIds, networkUuids)
    );

    const modelsById = R.flatMapToObj(models as ReadonlyArray<TModel>, (m) => [[m.uuid, m]]);
    const networkApisByUuid = R.flatMapToObj(api, (m) => [[m.uuid, m]]);

    const acc = { created: 0, updated: 0, deleted: 0, updatedModels: [], createdModels: [] };

    const writeHandler = () => {
      for (const uuid of dbIdsToRemove) {
        realm.delete(modelsById[uuid]);
        acc.deleted += 1;
      }

      for (const uuid of networkUuidsToUpsert) {
        combinedUpsertResults(
          acc,
          this.upsertWithinWrite(realm, networkApisByUuid[uuid], modelsById[uuid])
        );
      }
    };

    if (realm.isInTransaction) {
      writeHandler();
    } else {
      realm.write(writeHandler);
    }

    logger.info(
      'upsertMultiple for',
      this.klass.schema.name,
      `api length=${api.length}, ${humanizeUpsertResults(acc)}`
    );

    return acc;
  }

  private realmObjectFromApi(realm: Realm, relistenObj: TApi): TModel {
    const p = this.klass.propertiesFromApi(relistenObj);
    const r = this.klass.relationshipsFromApi
      ? this.klass.relationshipsFromApi(relistenObj)
      : undefined;
    const combined = R.merge(p, r);

    return new this.klass(realm, combined);
  }
}
