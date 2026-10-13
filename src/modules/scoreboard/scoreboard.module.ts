// register() returns the metadata of a DynamicModule (a "recipe").
// NestFactory is the one that builds the module and instantiates the class.
import { ConfigModule, ConfigRegistration } from "../../framework/config";
import { DynamicModule, ModuleMetadata } from "../../framework/module-scope";
import { SCOREBOARD_CONFIG, ScoreboardAppConfig, scoreboardWriteConfig, storageConfig } from "./scoreboard.config";
import { ScoreReaderService, ScoreWriterService } from "./scoreboard.services";
import { StorageProvider } from "./storage.provider";

export class ScoreboardModule {
  static readonly metadata: ModuleMetadata = {};

  static register(options: { appConfig: ConfigRegistration<ScoreboardAppConfig> }): DynamicModule {
    return {
      module: ScoreboardModule,
      imports: [
        ConfigModule.forFeature(storageConfig),
        ConfigModule.forFeature(scoreboardWriteConfig),
        ConfigModule.forFeature(options.appConfig),
      ],
      providers: [
        { provide: SCOREBOARD_CONFIG, useExisting: options.appConfig.KEY },
        StorageProvider,
        ScoreReaderService,
        ScoreWriterService,
      ],
      exports: [ScoreReaderService, ScoreWriterService],
    };
  }
}
