import { Controller, Post, Body } from '@nestjs/common';
import { DavisSetupService } from './davis-setup.service';

@Controller('dynatrace')
export class DynatraceController {
  constructor(private readonly davisSetupService: DavisSetupService) {}

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
}
