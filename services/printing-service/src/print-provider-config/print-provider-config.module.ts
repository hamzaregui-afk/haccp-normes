import { Module } from '@nestjs/common';
import { PrintProviderConfigController } from './print-provider-config.controller';
import { PrintProviderConfigService } from './print-provider-config.service';

@Module({
  controllers: [PrintProviderConfigController],
  providers:   [PrintProviderConfigService],
  exports:     [PrintProviderConfigService],
})
export class PrintProviderConfigModule {}
