// Force deterministic, colour-free output so report assertions are stable.
process.env.NO_COLOR = '1';
delete process.env.FORCE_COLOR;
