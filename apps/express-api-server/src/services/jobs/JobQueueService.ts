import PgBoss from "pg-boss";
import {config as databaseConfig} from "@requestai/database";

import logger from "@loaders/logger";

/**
 * Wraps pg-boss so the rest of the app doesn't have to know about its
 * lifecycle. There's one queue per pg-boss instance per process.
 *
 * Naming the boss queue here so workers and producers stay in sync.
 */
export const QUEUE_GENERATE_COLLECTION = "generate-collection";

export interface iGenerateCollectionPayload {
	aiJobId: string;
	userId: string;
	collectionId: string;
	versionId: string;
}

class JobQueueService {
	private boss: PgBoss | null = null;

	/**
	 * Boot pg-boss against the same Postgres database used by Drizzle.
	 * Idempotent — safe to call once at startup.
	 */
	async start(): Promise<void> {
		if (this.boss) {return;}

		this.boss = new PgBoss({
			connectionString: databaseConfig.database.url,
		});

		this.boss.on("error", (error) => {
			logger.error(null, "pg-boss runtime error", error);
		});

		await this.boss.start();
		await this.boss.createQueue(QUEUE_GENERATE_COLLECTION);

		logger.info(null, "pg-boss started; queues ready");
	}

	/**
	 * Gracefully stop pg-boss (used during shutdown).
	 */
	async stop(): Promise<void> {
		if (!this.boss) {return;}
		await this.boss.stop();
		this.boss = null;
	}

	getBoss(): PgBoss {
		if (!this.boss) {
			throw new Error("JobQueueService not started. Call start() at boot.");
		}
		return this.boss;
	}

	/**
	 * Enqueue a collection-generation job. Returns the pg-boss job id which
	 * we store on `ai_jobs.boss_job_id` for traceability.
	 */
	async enqueueGenerateCollection(
		payload: iGenerateCollectionPayload
	): Promise<string | null> {
		return this.getBoss().send(QUEUE_GENERATE_COLLECTION, payload);
	}

	/**
	 * Register a worker for the generate-collection queue. Pass a function
	 * that processes one job at a time. pg-boss handles retries on throw.
	 */
	async workOnGenerateCollection(
		handler: (payload: iGenerateCollectionPayload) => Promise<void>
	): Promise<void> {
		await this.getBoss().work(
			QUEUE_GENERATE_COLLECTION,
			async (jobs: PgBoss.Job<iGenerateCollectionPayload>[]) => {
				// pg-boss may invoke with an empty array on graceful shutdown.
				const job = jobs[0];
				if (!job) {return;}
				await handler(job.data);
			}
		);
	}
}

const jobQueueService = new JobQueueService();
export default jobQueueService;
