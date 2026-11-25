import type { ImageMetadata } from 'astro';
import sharpService from 'astro/assets/services/sharp';

const teamAssets = import.meta.glob<ImageMetadata>('../assets/team/*.jpg', {
  eager: true,
  import: 'default',
});
const teamSources = new Set(Object.values(teamAssets).map((photo) => photo.src));

export default {
  ...sharpService,
  validateOptions(options, config, logger) {
    const source = typeof options.src === 'string' ? options.src : options.src.src;
    const quality = options.quality ?? (teamSources.has(source) ? 95 : undefined);
    return sharpService.validateOptions!({ ...options, quality }, config, logger);
  },
} satisfies typeof sharpService;
