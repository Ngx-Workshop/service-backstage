import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ExampleMongodbDocEnum {
  SOME_ENUM = 'SOME_ENUM',
  SOME_OTHER_ENUM = 'SOME_OTHER_ENUM',
}

export type ExampleMongodbDocObject = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type ExampleMongodbDocDocument = ExampleMongodbDoc & Document;

@Schema()
export class ExampleMongodbDoc extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, enum: ExampleMongodbDocEnum })
  type: ExampleMongodbDocEnum;

  @Prop({ default: 1 })
  version: number;

  @Prop({ default: 'No description provided' })
  description: string;

  @Prop({ default: Date.now })
  lastUpdated: Date;

  @Prop({ default: false })
  archived: boolean;

  @Prop({ type: Object })
  exampleMongodbDocObject?: ExampleMongodbDocObject;
}

export const ExampleMongodbDocSchema =
  SchemaFactory.createForClass(ExampleMongodbDoc);

// Auto-increment version on updates
ExampleMongodbDocSchema.pre(
  ['findOneAndUpdate', 'updateOne', 'updateMany'],
  function () {
    const update = this.getUpdate() as any;
    if (update) {
      if (!update.$inc) {
        update.$inc = {};
      }
      update.$inc.version = 1;
    }
  }
);
