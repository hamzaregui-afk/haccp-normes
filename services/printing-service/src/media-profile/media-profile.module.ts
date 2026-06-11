import { Module } from '@nestjs/common';
import { MediaProfileController } from './media-profile.controller';
import { MediaProfileService } from './media-profile.service';

@Module({
  controllers: [MediaProfileController],
  providers:   [MediaProfileService],
  exports:     [MediaProfileService],
})
export class MediaProfileModule {}
