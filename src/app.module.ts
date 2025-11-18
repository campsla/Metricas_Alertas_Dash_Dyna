import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { DynatraceController } from './dynatrace.controller';
import { DavisSetupService } from './davis-setup.service';

@Module({
  imports: [],
  controllers: [AppController, DynatraceController],
  providers: [AppService, DavisSetupService],
})
export class AppModule {}
