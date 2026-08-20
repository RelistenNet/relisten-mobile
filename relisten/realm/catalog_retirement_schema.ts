import Realm from 'realm';

export interface CatalogRetirementState {
  retiredAt?: Date;
  retirementReason?: string;
}

export const CATALOG_RETIREMENT_SCHEMA_PROPERTIES = {
  retiredAt: { type: 'date', optional: true, indexed: true },
  retirementReason: 'string?',
} satisfies Realm.PropertiesTypes;
