-- Expenses in other currencies and settle-up payments. Run once in the SQL
-- editor, after 0004.

alter table expenses
  -- Yuan per one unit of `currency`, fixed when the expense was saved, so
  -- balances do not move with the exchange rate afterwards. 1 for CNY.
  add column rate numeric(12,6) not null default 1 check (rate > 0),
  -- A repayment from paid_by to the one member in split_with, not a cost.
  add column is_settlement boolean not null default false;
