import {relations} from "drizzle-orm";
import {index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid} from "drizzle-orm/pg-core";

import {users} from "../betterAuth/betterAuth.schema";

export const billingOrderState = pgEnum("billing_order_state", [
	"created",
	"attempted",
	"paid",
	"failed",
	"refunded",
]);

export const billingCurrency = pgEnum("billing_currency", ["INR", "USD"]);

/**
 * One row per Razorpay order. Created when the user clicks "Buy credits";
 * progressed via the Razorpay webhook. Credit grant happens when the row
 * transitions to `paid` (and is recorded as a `credit_ledger` row).
 *
 * Amount is stored in the smallest currency unit (paise for INR, cents for
 * USD) to avoid float drift.
 */
export const billingOrders = pgTable(
	"billing_orders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, {onDelete: "cascade"}),
		razorpayOrderId: text("razorpay_order_id").notNull(),
		razorpayPaymentId: text("razorpay_payment_id"),
		amount: integer("amount").notNull(),
		currency: billingCurrency("currency").notNull(),
		creditsPurchased: integer("credits_purchased").notNull(),
		packKey: text("pack_key").notNull(),
		state: billingOrderState("state").default("created").notNull(),
		failureReason: text("failure_reason"),
		createdAt: timestamp("created_at", {withTimezone: true}).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", {withTimezone: true})
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		paidAt: timestamp("paid_at", {withTimezone: true}),
	},
	(table) => [
		index("billing_orders_user_id_idx").on(table.userId),
		uniqueIndex("billing_orders_razorpay_order_id_uidx").on(table.razorpayOrderId),
	],
);

export type BillingOrder = typeof billingOrders.$inferSelect;
export type NewBillingOrder = typeof billingOrders.$inferInsert;

export const billingOrdersRelations = relations(billingOrders, ({one}) => ({
	user: one(users, {
		fields: [billingOrders.userId],
		references: [users.id],
	}),
}));
