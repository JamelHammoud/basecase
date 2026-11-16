# Inputs testing evidence

Coverage: [cases](../guide/cases.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Windows voice and saved-policy startup

The recorded sit walkthrough in `e2e/inputs.e2e.test.ts` and saved web training walkthrough in `e2e/webTrain.e2e.test.ts` are quarantined only on Windows through 28 November 2026 under the existing worker-start issue [#995](https://github.com/JamelHammoud/basecase/issues/995). Run 43710741335 left Drive off before the voice assertion and kept simulation loading with the hold controller after the saved skill's Try action, both on both attempts. Linux passed both at the same commit. The preceding Windows run 43708315996 passed them in 8.0 s and 16.4 s, with unchanged tests and startup paths. The failing worker or initialization stage is not established.

## Windows dataset training and wave completion

The focused `e2e/trainFromTries.e2e.test.ts` walkthrough and the held-wave test in `e2e/inputs.e2e.test.ts` are quarantined on Windows through 28 November 2026 under the open priority issue [#995](https://github.com/JamelHammoud/basecase/issues/995). Run 43721538732 observed no training request after the button click on either attempt, while Linux passed at the same commit in 12.995 s. The focused test came from `b2b1c63c3` after the last green run. The wave’s second attempt left `operatorCamera().feeding` true for its unchanged 10 s poll, while its first attempt reached the event assertion. The preceding Windows run 43715791435 passed the unchanged input file. The failing training preparation and feed completion stages are not established. The builder restoring them must trace the failing stages and measure at least ten runs before and after at equal load.
