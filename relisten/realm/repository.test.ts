import Realm from 'realm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: {
    extend: () => ({
      error: vi.fn(),
      info: vi.fn(),
    }),
  },
}));

import { RelistenApiUpdatableObject, Repository } from '@/relisten/realm/repository';
import { RelistenObjectRequiredProperties } from '@/relisten/realm/relisten_object';

const TEST_REALM_PATH = '/tmp/relisten-repository-tombstone-test.realm';

interface TestApi extends RelistenApiUpdatableObject {
  name: string;
}

interface TestCatalogProperties extends RelistenObjectRequiredProperties {
  name: string;
}

class TestParent extends Realm.Object<TestParent> {
  static schema: Realm.ObjectSchema = {
    name: 'TestParent',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
    },
  };

  uuid!: string;
}

class TestCatalog
  extends Realm.Object<TestCatalog, keyof TestCatalogProperties>
  implements TestCatalogProperties
{
  static schema: Realm.ObjectSchema = {
    name: 'TestCatalog',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: { type: 'date', optional: true, indexed: true },
      name: 'string',
      parent: 'TestParent?',
    },
  };

  static propertiesFromApi(api: TestApi): TestCatalogProperties {
    const updatedAt = new Date(api.updated_at);
    return {
      uuid: api.uuid,
      createdAt: updatedAt,
      updatedAt,
      name: api.name,
    };
  }

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date;
  name!: string;
  parent?: TestParent;
}

const repository = new Repository(TestCatalog);
const config: Realm.Configuration = {
  path: TEST_REALM_PATH,
  schema: [TestParent, TestCatalog],
};

const apiRow: TestApi = {
  uuid: 'catalog-row',
  name: 'Catalog row',
  updated_at: '2026-08-20T00:00:00.000Z',
};

function deleteRealm(configToDelete: Realm.Configuration) {
  if (Realm.exists(configToDelete)) {
    Realm.deleteFile(configToDelete);
  }
}

describe('Repository catalog tombstones', () => {
  let realm: Realm;

  beforeEach(() => {
    deleteRealm(config);
    realm = new Realm(config);
  });

  afterEach(() => {
    realm.close();
    deleteRealm(config);
  });

  afterAll(() => {
    Realm.shutdown();
  });

  it('tombstones an omitted row without invalidating it or its links', () => {
    repository.upsert(realm, apiRow, undefined);
    const model = realm.objectForPrimaryKey(TestCatalog, apiRow.uuid)!;
    const parent = realm.write(() => realm.create(TestParent, { uuid: 'parent' }));
    realm.write(() => {
      model.parent = parent;
    });

    const result = repository.upsertMultiple(realm, [], realm.objects(TestCatalog), true);
    const deletedAt = model.deletedAt;

    expect(result.deleted).toBe(1);
    expect(deletedAt).toBeInstanceOf(Date);
    expect(model.isValid()).toBe(true);
    expect(model.parent?.uuid).toBe('parent');
    expect(realm.objects(TestCatalog).filtered('deletedAt == nil')).toHaveLength(0);
    expect(realm.objectForPrimaryKey(TestCatalog, model.uuid)?.uuid).toBe(model.uuid);

    const repeated = repository.upsertMultiple(realm, [], realm.objects(TestCatalog), true);
    expect(repeated.deleted).toBe(0);
    expect(model.deletedAt).toEqual(deletedAt);
  });

  it('restores a tombstone even when the API timestamp is unchanged', () => {
    repository.upsert(realm, apiRow, undefined);
    const model = realm.objectForPrimaryKey(TestCatalog, apiRow.uuid)!;
    repository.upsertMultiple(realm, [], realm.objects(TestCatalog), true);

    const activeRows = realm.objects(TestCatalog).filtered('deletedAt == nil');
    const result = repository.upsertMultiple(realm, [apiRow], activeRows, true, true);

    expect(result.updated).toBe(1);
    expect(result.allModels[0].uuid).toBe(model.uuid);
    expect(model.deletedAt).toBeNull();
    expect(model.isValid()).toBe(true);
  });

  it('preserves omitted rows when deletion is disabled', () => {
    repository.upsert(realm, apiRow, undefined);
    const model = realm.objectForPrimaryKey(TestCatalog, apiRow.uuid)!;

    const result = repository.upsertMultiple(realm, [], realm.objects(TestCatalog), false);

    expect(result.deleted).toBe(0);
    expect(model.deletedAt).toBeNull();
    expect(model.isValid()).toBe(true);
  });
});
