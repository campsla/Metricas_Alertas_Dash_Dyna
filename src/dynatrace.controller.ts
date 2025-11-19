import {
  Body,
  Controller,
  Post,
  Delete,
  Put,
  Get,
  BadRequestException,
} from '@nestjs/common';
import { DavisSetupService } from './davis-setup.service';


@Controller('dynatrace')
export class DynatraceController {
  constructor(private readonly davisSetupService: DavisSetupService) { }

  // Endpoint: POST http://localhost:3000/dynatrace/create-heartbeat
  @Post('create-heartbeat')
  async createHeartbeat(
    @Body() body: { flowName: string; successLog: string },
  ) {
    const { flowName, successLog } = body;

    // llamamos al servicio que ya creaste en el paso anterior
    return this.davisSetupService.createLogMetricAndAnomaly(
      flowName,
      successLog,
    );
  }

  @Delete('heartbeat')
  async deleteHeartbeat(@Body('flowName') flowName: string) {
    if (!flowName) {
      throw new BadRequestException('flowName es obligatorio');
    }

    return this.davisSetupService.deleteLogMetricAndAnomaly(flowName);
  }

  @Put('heartbeat/metric')
  async updateHeartbeatMetric(
    @Body('flowName') flowName: string,
    @Body('successLog') successLog: string,
  ) {
    if (!flowName || !successLog) {
      throw new BadRequestException(
        'flowName y successLog son obligatorios',
      );
    }

    return this.davisSetupService.updateLogMetricQuery(flowName, successLog);
  }

  @Get('heartbeats')
  async listHeartbeats() {
    return this.davisSetupService.listHeartbeats();
  }


}
