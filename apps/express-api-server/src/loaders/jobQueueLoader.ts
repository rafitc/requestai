import logger from "@loaders/logger";
import {jobQueueService} from "@services/jobs";
import {registerGenerationWorker} from "@services/generation";

/**
 * Boots the job queue (pg-boss) and registers all workers. Called once
 * during app startup, after the database is reachable.
 */
async function loadJobQueue(): Promise<void> {
	await jobQueueService.start();
	await registerGenerationWorker();

	logger.info(null, "Job queue loaded");
}

export default loadJobQueue;
