export interface RelistenObject {
  uuid: string;
}

export interface RelistenObjectRequiredProperties extends RelistenObject {
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
