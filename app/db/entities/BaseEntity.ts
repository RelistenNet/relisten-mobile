import {UpdateDateColumn} from 'typeorm';

export abstract class BaseEntity {
  @UpdateDateColumn()
  lastStoredAt: Date;
}

export function createFromPOJO<EntityType extends BaseEntity, T extends object>(
  entityPrototype: {new (): EntityType},
  json: Record<string, any>,
): EntityType {
  const inst = new entityPrototype();
  for (let key in json) {
    (inst as any)[key] = json[key];
  }
  return inst;
}
