interface StartupPreparationRunnerOptions {
  prepare: () => Promise<void>;
  onReady: () => void;
  onError: (error: unknown) => void;
}

/** Coalesces startup retry signals without retrying continuously after a failure. */
export function createStartupPreparationRunner({
  prepare,
  onReady,
  onError,
}: StartupPreparationRunnerOptions) {
  let active = true;
  let preparing = false;
  let complete = false;
  let retryRequested = false;

  const request = () => {
    if (!active || complete) {
      return;
    }

    if (preparing) {
      retryRequested = true;
      return;
    }

    preparing = true;
    void prepare()
      .then(() => {
        complete = true;
        if (active) {
          onReady();
        }
      })
      .catch(onError)
      .finally(() => {
        preparing = false;
        if (retryRequested) {
          retryRequested = false;
          request();
        }
      });
  };

  return {
    request,
    dispose() {
      active = false;
      retryRequested = false;
    },
  };
}
