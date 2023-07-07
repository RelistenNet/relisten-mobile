import dayjs from "dayjs";

export enum FieldTypes {
    String = 1,
    DateTime,
    JSON,
    Number,
    Boolean,
}

export const PARSE_FROM_DB: { [fieldType in FieldTypes]: (raw: any) => any } = {
    [FieldTypes.String]: (raw) => raw,
    [FieldTypes.DateTime]: (raw) => dayjs?.unix(raw),
    [FieldTypes.JSON]: (raw) => raw ? JSON.parse(raw) : raw,
    [FieldTypes.Number]: (raw) => {
        if (raw === null || raw === undefined) {
            return raw;
        }

        return Number(raw);
    },
    [FieldTypes.Boolean]: (raw) => raw ? 1 : 0
}

export const SERIALIZE_TO_DB: { [fieldType in FieldTypes]: (raw: any) => any } = {
    [FieldTypes.String]: (raw) => raw,
    [FieldTypes.DateTime]: (raw: dayjs.Dayjs) => {
        return raw?.unix();
    },
    [FieldTypes.JSON]: (raw) => {
        if (raw === null || raw === undefined) {
            return raw;
        }

        return JSON.stringify(raw);
    },
    [FieldTypes.Number]: (raw) => raw,
    [FieldTypes.Boolean]: raw => !!raw,
}
