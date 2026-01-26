import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  ExampleMongodbDocEnum,
  ExampleMongodbDocObject,
} from '../schemas/example-mongodb-doc.schema';

/**
 * DTO that mirrors ExampleMongodbDocObject from the schema
 */
export class ExampleMongodbDocObjectDto implements ExampleMongodbDocObject {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  zip: string;
}

/**
 * READ/Response DTO for a single ExampleMongodbDoc
 */
export class ExampleMongodbDocDto {
  @ApiProperty() _id: string;

  @ApiProperty() name: string;

  @ApiProperty({ enum: ExampleMongodbDocEnum })
  type: ExampleMongodbDocEnum;

  @ApiProperty() version: number;

  @ApiProperty() description: string;

  @ApiProperty({ type: String, format: 'date-time' })
  lastUpdated: string;

  @ApiProperty() archived: boolean;

  @ApiPropertyOptional({ type: () => ExampleMongodbDocObjectDto })
  exampleMongodbDocObject?: ExampleMongodbDocObjectDto;

  @ApiProperty() __v: number;
}

/**
 * CREATE DTO – only user-supplied fields (version & timestamps are handled by the model)
 */
export class CreateExampleMongodbDocDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ExampleMongodbDocEnum })
  @IsEnum(ExampleMongodbDocEnum)
  @IsNotEmpty()
  type: ExampleMongodbDocEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  archived?: boolean;

  @ApiPropertyOptional({ type: () => ExampleMongodbDocObjectDto })
  @ValidateNested()
  @Type(() => ExampleMongodbDocObjectDto)
  @IsOptional()
  exampleMongodbDocObject?: ExampleMongodbDocObjectDto;

  // Expose in case clients want to explicitly set it; otherwise schema default (Date.now) applies
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsDateString()
  @IsOptional()
  lastUpdated?: string;
}

/**
 * UPDATE DTO – Partial of Create DTO
 */
export class UpdateExampleMongodbDocDto extends PartialType(
  CreateExampleMongodbDocDto
) {}
