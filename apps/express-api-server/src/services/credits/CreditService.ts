import {creditLedger, db, eq, sql, users, type DBTransaction} from "@requestai/database";

import logger from "@loaders/logger";

export type CreditReason =
	| "signup_grant"
	| "purchase"
	| "generation_spend"
	| "refund"
	| "admin_adjustment";

/**
 * Anything that can run a SELECT / INSERT — either the top-level `db` or
 * a Drizzle transaction object. Lets callers compose a debit into a
 * larger transaction (e.g. insert collection rows + debit atomically).
 */
type Executor = typeof db | DBTransaction;

/**
 * Owns every read and write on `credit_ledger`.
 *
 * Balance is the running sum of `delta`. Writes happen inside transactions
 * that take `SELECT … FOR UPDATE` on the user row first, so two concurrent
 * generation requests can't both spend the same last credit.
 */
class CreditService {
	/**
	 * Current balance for a user. Sums the ledger — `O(N)` but N is small
	 * and accurate by definition (no drift from a denormalized counter).
	 */
	async getBalance(userId: string, exec: Executor = db): Promise<number> {
		const [row] = await exec
			.select({balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int`})
			.from(creditLedger)
			.where(eq(creditLedger.userId, userId));
		return row?.balance ?? 0;
	}

	/**
	 * Atomically debit `amount` credits if the user has at least that much.
	 *
	 * Returns the new balance on success, or `null` if the user couldn't
	 * afford it. Callers should treat `null` as "402 Payment Required".
	 *
	 * When a transaction is passed via `exec`, the lock + insert join that
	 * transaction (so the caller's other writes commit atomically with the
	 * debit). Otherwise we open our own transaction.
	 */
	async tryDebit(args: {
		userId: string;
		amount: number;
		reason: CreditReason;
		refId: string;
		exec?: Executor;
	}): Promise<number | null> {
		const {userId, amount, reason, refId, exec} = args;
		if (amount <= 0) {
			throw new Error("tryDebit amount must be positive");
		}

		const run = async (tx: Executor): Promise<number | null> => {
			await tx.execute(sql`select id from ${users} where id = ${userId} for update`);

			const current = await this.getBalance(userId, tx);
			if (current < amount) {return null;}

			const newBalance = current - amount;
			await tx.insert(creditLedger).values({
				userId,
				delta: -amount,
				balanceAfter: newBalance,
				reason,
				refId,
			});

			logger.info(null, "Credits debited", null, {
				userId,
				amount,
				reason,
				refId,
				newBalance,
			});
			return newBalance;
		};

		if (exec) {return run(exec);}
		return db.transaction((tx) => {return run(tx);});
	}

	/**
	 * Refund previously-debited credits. Used by the worker when a job
	 * that was charged up-front later fails.
	 */
	async refund(args: {
		userId: string;
		amount: number;
		refId: string;
	}): Promise<number> {
		const {userId, amount, refId} = args;
		if (amount <= 0) {
			throw new Error("refund amount must be positive");
		}

		return db.transaction(async (tx) => {
			await tx.execute(sql`select id from ${users} where id = ${userId} for update`);

			const current = await this.getBalance(userId, tx);
			const newBalance = current + amount;

			await tx.insert(creditLedger).values({
				userId,
				delta: amount,
				balanceAfter: newBalance,
				reason: "refund",
				refId,
			});

			logger.info(null, "Credits refunded", null, {userId, amount, refId, newBalance});
			return newBalance;
		});
	}
}

const creditService = new CreditService();
export default creditService;
