import {relations} from "drizzle-orm";
import {index, integer, pgEnum, pgTable, text, timestamp, uuid} from "drizzle-orm/pg-core";

import {users} from "../betterAuth/betterAuth.schema";

export const creditLedgerReason = pgEnum("credit_ledger_reason", [
	"signup_grant",
	"purchase",
	"generation_spend",
	"refund",
	"admin_adjustment",
]);

/**
 * Append-only ledger of every credit movement for a user. Balance is the sum
 * of all `delta` rows; `balanceAfter` is denormalized for O(1) reads and as
 * a tamper check.
 *
 * All writes go through CreditService inside a transaction with FOR UPDATE
 * on the user row to prevent races.
 */
export const creditLedger = pgTable(
	"credit_ledger",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, {onDelete: "cascade"}),
		delta: integer("delta").notNull(),
		balanceAfter: integer("balance_after").notNull(),
		reason: creditLedgerReason("reason").notNull(),
		refId: text("ref_id"),
		createdAt: timestamp("created_at", {withTimezone: true}).defaultNow().notNull(),
	},
	(table) => [
		index("credit_ledger_user_id_idx").on(table.userId),
		index("credit_ledger_user_created_idx").on(table.userId, table.createdAt),
	],
);

export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert;

export const creditLedgerRelations = relations(creditLedger, ({one}) => ({
	user: one(users, {
		fields: [creditLedger.userId],
		references: [users.id],
	}),
}));
