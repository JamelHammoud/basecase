# First launch testing evidence

Coverage: [scene-tabs](../guide/scene-tabs.md#testing-coverage). Shared contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## First-launch relaunch

The saved-scene relaunch test in `e2e/firstLaunch.e2e.test.ts` is quarantined through 28 November 2026 under [#795](https://github.com/JamelHammoud/basecase/issues/795), which already tracks Windows saving the untouched rover. Linux run 43728033376 observed no scene save for its unchanged 10 s poll, then two scene ids on retry. The preceding green Linux run 43715791435 passed the test in 10.588 s. Attempts share the app and its write history, so the retry does not establish the first failure's cause. The draft change, scheduling or serialization stage responsible is not established. The builder must trace from page load, isolate attempts and measure at least ten runs before and after at equal load on Linux and Windows before removing the quarantine.
