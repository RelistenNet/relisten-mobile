import Realm from 'realm';
import { RelistenObjectRequiredProperties } from './relisten_object';
import dayjs from 'dayjs';
import * as R from 'remeda';
import { log } from '../util/logging';
import { groupByUuid } from '@/relisten/util/group_by';
import { RealmObject } from 'realm/dist/public-types/Object';

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

  public forUuids(
    realm: Realm,
    uuids?: ReadonlyArray<string>
  ): Realm.Results<RealmObject<TModel, never> & TModel> {
    let query = realm.objects<TModel>(this.klass.name);

    if (uuids) {
      query = query.filtered('uuid in $0', uuids);
    }

    return query;
  }

  public updateObjectFromApi(realm: Realm, model: TModel, relistenObj: TApi): TModel {
    const p = this.klass.propertiesFromApi(relistenObj);
    const r = this.klass.relationshipsFromApi
      ? this.klass.relationshipsFromApi(relistenObj)
      : undefined;

    for (const [prop, value] of Object.entries(p) as [
      keyof RequiredProperties,
      RequiredProperties[keyof RequiredProperties],
    ][]) {
      if (prop === 'uuid' && (model as any)[prop] !== value) {
        logger.error(
          `ERROR; ATTEMPTING TO UPDATE PRIMARY KEY, skipping: ${String(prop)}=${value}, old value=${(model as any)[prop]}`
        );
      }

      if (prop !== 'uuid') {
        (model as any)[prop] = value;
      }
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
    queryForModel = true
  ): UpsertResults<TModel> {
    if (queryForModel && !model) {
      model =
        realm.objectForPrimaryKey<TModel>(this.klass.name, api.uuid as unknown as any) || undefined;
    }

    if (model) {
      if (api.uuid !== model.uuid) {
        logger.error(
          `upsertWithinWrite with mismatched ${this.klass.name}: api.uuid=${api.uuid}, model.uuid=${model.uuid}`
        );
      }

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
    models: ReadonlyArray<TModel> | Realm.List<TModel> | Realm.Results<TModel>,
    performDeletes: boolean = true,
    queryForModel = false
  ): UpsertResults<TModel> {
    const dbIds = [...new Set(models.map((m) => m.uuid))];
    const networkUuids = [...new Set(api.map((a) => a.uuid))];

    const dbIdsToRemove = R.difference(dbIds, networkUuids);
    const networkUuidsToUpsert = R.difference(networkUuids, dbIds).concat(
      R.intersection(dbIds, networkUuids)
    );

    const modelsById = groupByUuid(models as ReadonlyArray<TModel>);
    const networkApisByUuid = groupByUuid(api);

    const acc = { created: 0, updated: 0, deleted: 0, updatedModels: [], createdModels: [] };

    const writeHandler = () => {
      if (performDeletes) {
        for (const uuid of dbIdsToRemove) {
          realm.delete(modelsById[uuid]);
          acc.deleted += 1;
        }
      }

      for (const uuid of networkUuidsToUpsert) {
        combinedUpsertResults(
          acc,
          this.upsertWithinWrite(realm, networkApisByUuid[uuid], modelsById[uuid], queryForModel)
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
      `api length=${networkUuids.length}, ${humanizeUpsertResults(acc)}`
    );

    return acc;
  }

  private realmObjectFromApi(realm: Realm, relistenObj: TApi): TModel {
    const p = this.klass.propertiesFromApi(relistenObj);
    const r = this.klass.relationshipsFromApi
      ? this.klass.relationshipsFromApi(relistenObj)
      : undefined;
    const combined = R.merge(p, r);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return new this.klass(realm, combined);
  }
}
