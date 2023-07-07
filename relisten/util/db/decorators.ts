import 'reflect-metadata';
import type {Model} from "./model";
import {FieldTypes} from "./field_types";

export interface FieldMetadata {
    columnName: string;
    type: FieldTypes;
}

const fieldMetadataSymbol = Symbol("fieldOptions");

export function field(columnNameOrOptions: string | FieldMetadata, type?: FieldTypes) {
    let options: FieldMetadata | undefined = undefined;

    if (typeof columnNameOrOptions === "string") {
        options = {
            columnName: columnNameOrOptions,
            type: type || FieldTypes.String
        };
    } else {
        options = columnNameOrOptions;
    }

    return Reflect.metadata(fieldMetadataSymbol, options);
}

export function getFieldMetadata(target: any, propertyKey: string): FieldMetadata {
    return Reflect.getMetadata(fieldMetadataSymbol, target, propertyKey);
}

export interface ModelMetadata {
    tableName: string;
}

const modelOptionsSymbol = Symbol("modelOptions");

export function model(tableNameOrOptions: string | ModelMetadata) {
    let options: ModelMetadata | undefined = undefined;

    if (typeof tableNameOrOptions === "string") {
        options = {
            tableName: tableNameOrOptions,
        };
    } else {
        options = tableNameOrOptions;
    }

    return (ctor: Function) => {
        ctor.prototype.modelMetadata = options;
    };
}

export function getModelMetadata(target: typeof Model): ModelMetadata {
    return target.prototype.modelMetadata;
}
