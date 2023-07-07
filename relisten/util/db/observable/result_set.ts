import {Model} from "../model";
import {Query} from "../queries";

export class ResultSet<T extends Model, C extends typeof Model> {
    constructor(public readonly model: C, public readonly originatingQuery: Query, public readonly results: T[]) {
    }
}
