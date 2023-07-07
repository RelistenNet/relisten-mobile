import {field, FieldMetadata, getFieldMetadata, getModelMetadata, ModelMetadata} from "./decorators";
import {PARSE_FROM_DB, SERIALIZE_TO_DB} from "./field_types";
import {ResultSet} from "./observable/result_set";

export class Model {
    @field('id') id!: string;

    public modelMetadata!: ModelMetadata;
    public resultSet?: ResultSet<Model, typeof Model>;

    static createFromDatabase<T extends Model>(raw: { [columnName: string]: any }, resultSet: ResultSet<Model, typeof Model>): T {
        const inst = new this;
        inst.resultSet = resultSet;

        for (const {property, field} of inst.allFieldMetadata()) {
            (inst as any)[property] = PARSE_FROM_DB[field.type](raw[field.columnName]);
        }

        return inst as T;
    }

    private _allFieldMetadata?: { property: string, field: FieldMetadata }[] = undefined;
    allFieldMetadata(): { property: string, field: FieldMetadata }[] {
        if (this._allFieldMetadata) {
            return this._allFieldMetadata;
        }

        const r = [];

        for (const property of Object.getOwnPropertyNames(this)) {
            const field = getFieldMetadata(this, property);

            if (field) {
                r.push({property, field});
            }
        }

        this._allFieldMetadata = r;

        return r;
    }

    toStorage(): { [columnName: string]: any } {
        const r: { [columnName: string]: any } = {};

        for (const {property, field} of this.allFieldMetadata()) {
            r[field.columnName] = SERIALIZE_TO_DB[field.type]((this as any)[property]);
        }

        return r;
    }
}
