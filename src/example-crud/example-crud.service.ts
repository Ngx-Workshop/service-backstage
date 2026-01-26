import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { lastValueFrom, of } from 'rxjs';
import { CreateExampleMongodbDocDto } from './dto/create.dto';
import { UpdateExampleMongodbDocDto } from './dto/update.dto';
import {
  ExampleMongodbDoc,
  ExampleMongodbDocDocument,
} from './schemas/example-mongodb-doc.schema';

@Injectable()
export class ExampleCrudService {
  constructor(
    @InjectModel(ExampleMongodbDoc.name)
    private exampleMongodbDocModel: Model<ExampleMongodbDocDocument>
  ) {}

  async authTest(): Promise<{ message: string }> {
    return lastValueFrom(of({ message: 'Authentication successful Service' }));
  }

  async create(
    createExampleMongodbDocDto: CreateExampleMongodbDocDto
  ): Promise<ExampleMongodbDoc> {
    try {
      const createExampleMongodbDoc = new this.exampleMongodbDocModel({
        ...createExampleMongodbDocDto,
        lastUpdated: new Date(),
      });
      return await createExampleMongodbDoc.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException(
          'ExampleMongodbDoc with this name already exists'
        );
      }
      throw error;
    }
  }

  async findAll(archived?: boolean): Promise<ExampleMongodbDoc[]> {
    const filter = archived !== undefined ? { archived } : {};
    return await this.exampleMongodbDocModel.find(filter).exec();
  }

  async findOne(id: string): Promise<ExampleMongodbDoc> {
    const exampleMongodbDoc = await this.exampleMongodbDocModel
      .findById(id)
      .exec();
    if (!exampleMongodbDoc) {
      throw new NotFoundException(
        `ExampleMongodbDoc with ID "${id}" not found`
      );
    }
    return exampleMongodbDoc;
  }

  async findByName(name: string): Promise<ExampleMongodbDoc> {
    const exampleMongodbDoc = await this.exampleMongodbDocModel
      .findOne({ name })
      .exec();
    if (!exampleMongodbDoc) {
      throw new NotFoundException(
        `ExampleMongodbDoc with name "${name}" not found`
      );
    }
    return exampleMongodbDoc;
  }

  async update(
    id: string,
    updateExampleMongodbDocDto: UpdateExampleMongodbDocDto
  ): Promise<ExampleMongodbDoc> {
    try {
      const updateExampleMongodbDoc = await this.exampleMongodbDocModel
        .findByIdAndUpdate(
          id,
          { ...updateExampleMongodbDocDto, lastUpdated: new Date() },
          { new: true }
        )
        .exec();

      if (!updateExampleMongodbDoc) {
        throw new NotFoundException(
          `ExampleMongodbDoc with ID "${id}" not found`
        );
      }

      return updateExampleMongodbDoc;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException(
          'ExampleMongodbDoc with this name already exists'
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.exampleMongodbDocModel
      .findByIdAndDelete(id)
      .exec();
    if (!result) {
      throw new NotFoundException(
        `ExampleMongodbDoc with ID "${id}" not found`
      );
    }
  }

  async archive(id: string): Promise<ExampleMongodbDoc> {
    return await this.update(id, { archived: true });
  }

  async unarchive(id: string): Promise<ExampleMongodbDoc> {
    return await this.update(id, { archived: false });
  }
}
