export {default as creditService, type CreditReason} from "./CreditService";

/**
 * Credits charged per collection generation. Keep as a const for now; once
 * model-cost variability matters we can lift this into config keyed by
 * provider/model.
 */
export const GENERATION_CREDIT_COST = 1;
