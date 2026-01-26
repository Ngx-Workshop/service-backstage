import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RemoteAuthGuard } from '@tmdjr/ngx-auth-client';
import { BackstageCatalogService } from './backstage-catalog.service';
import {
  ListServicesQueryDto,
  ServiceDetailQueryDto,
} from './dto/list-services-query.dto';
import { ServiceDetailDto, ServiceSummaryDto } from './dto/service-summary.dto';
import { SyncRequestDto, SyncResponseDto } from './dto/sync.dto';

@ApiTags('Backstage Catalog')
@ApiBearerAuth()
@Controller('backstage')
export class BackstageCatalogController {
  constructor(private readonly service: BackstageCatalogService) {}

  // TODO: swap RemoteAuthGuard for a dedicated admin guard when available
  @UseGuards(RemoteAuthGuard)
  @Get('services')
  @ApiOperation({ summary: 'List cached backstage services' })
  @ApiOkResponse({ type: ServiceSummaryDto, isArray: true })
  async list(
    @Query() query: ListServicesQueryDto
  ): Promise<ServiceSummaryDto[]> {
    return this.service.listServices(query);
  }

  @UseGuards(RemoteAuthGuard)
  @Get('services/:repo')
  @ApiOperation({ summary: 'Get full detail for a specific repo' })
  @ApiOkResponse({ type: ServiceDetailDto })
  async getOne(
    @Param('repo') repo: string,
    @Query() query: ServiceDetailQueryDto
  ): Promise<ServiceDetailDto> {
    return this.service.getService(repo, query);
  }

  @UseGuards(RemoteAuthGuard)
  @Post('sync')
  @ApiBody({ type: SyncRequestDto })
  @ApiOkResponse({ type: SyncResponseDto })
  async sync(@Body() body: SyncRequestDto): Promise<SyncResponseDto> {
    return this.service.sync(body);
  }

  @UseGuards(RemoteAuthGuard)
  @Get('services/:repo/readme')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  async readme(
    @Param('repo') repo: string,
    @Query('refresh') refresh?: string
  ): Promise<string> {
    const blob = await this.service.getDocBlob(
      repo,
      'readme',
      refresh === 'true'
    );
    return blob.content;
  }

  @UseGuards(RemoteAuthGuard)
  @Get('services/:repo/openapi')
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  async openapi(
    @Param('repo') repo: string,
    @Query('refresh') refresh?: string
  ): Promise<string> {
    const blob = await this.service.getDocBlob(
      repo,
      'openapi',
      refresh === 'true'
    );
    return blob.content;
  }

  @UseGuards(RemoteAuthGuard)
  @Get('services/:repo/runbook')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  async runbook(
    @Param('repo') repo: string,
    @Query('refresh') refresh?: string
  ): Promise<string> {
    const blob = await this.service.getDocBlob(
      repo,
      'runbook',
      refresh === 'true'
    );
    return blob.content;
  }

  @UseGuards(RemoteAuthGuard)
  @Get('services/:repo/metadata')
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  async metadata(
    @Param('repo') repo: string,
    @Query('refresh') refresh?: string
  ): Promise<string> {
    const blob = await this.service.getDocBlob(
      repo,
      'serviceMetadata',
      refresh === 'true'
    );
    return blob.content;
  }
}
