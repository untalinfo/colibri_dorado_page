import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { placeOrder, resumeOrder, submitReceipt } from '../../application/orderUseCases';

export const initialFlowState = {
  step: 'resuming',
  busy: false,
  fieldErrors: {},
  errorCode: null,
  errorExtra: null,
  order: null,
};

// The reducer must never throw: late results (after a reset or a step change) are ignored
// unless the step and order they depend on still match.
export function orderFlowReducer(state, action) {
  switch (action.type) {
    case 'BUSY':
      return { ...state, busy: true, errorCode: null, errorExtra: null };
    case 'FIELD_ERRORS':
      return state.step === 'form' ? { ...state, busy: false, fieldErrors: action.errors } : state;
    case 'FAIL':
      return { ...state, busy: false, errorCode: action.code, errorExtra: action.extra ?? null };
    case 'ORDER_READY': {
      const canStart = state.step === 'resuming' || state.step === 'form';
      return canStart && action.order
        ? { ...initialFlowState, step: 'payment', order: action.order }
        : state;
    }
    // Payment data is dropped as soon as the receipt is in.
    case 'DONE':
      return state.step === 'payment' && state.order
        ? { ...initialFlowState, step: 'done', order: { ref: state.order.ref } }
        : state;
    case 'RESUME_FAILED':
      return state.step === 'resuming'
        ? { ...initialFlowState, step: 'resume_error', errorCode: action.code }
        : state;
    case 'RESUME_RETRY':
      return state.step === 'resume_error' ? { ...initialFlowState, step: 'resuming' } : state;
    case 'RESET':
      return { ...initialFlowState, step: 'form' };
    default:
      return state;
  }
}

const failure = (error) => ({
  type: 'FAIL',
  code: error?.code ?? 'UNKNOWN',
  extra: Number.isFinite(error?.available) ? { available: error.available } : null,
});

export function useOrderFlow({ repository, store }) {
  const [state, dispatch] = useReducer(orderFlowReducer, initialFlowState);
  const [attempt, setAttempt] = useState(0);
  // Bumped on reset/unmount: results of runs started before it are discarded.
  const generation = useRef(0);
  const inFlight = useRef(null);

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  // `attempt` re-runs the resume after a failed one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is a retry trigger
  useEffect(() => {
    let active = true;
    resumeOrder(repository, store)
      .then(
        (order) => active && dispatch(order ? { type: 'ORDER_READY', order } : { type: 'RESET' }),
      )
      .catch((error) => {
        if (active) dispatch({ type: 'RESUME_FAILED', code: error?.code ?? 'UNKNOWN' });
      });
    return () => {
      active = false;
    };
  }, [repository, store, attempt]);

  // Double-submit guard: the ref blocks a second call before React re-renders `busy`.
  // `task` returns the action to dispatch once it succeeds.
  const run = useCallback(
    async (task) => {
      const gen = generation.current;
      if (inFlight.current === gen) return;
      inFlight.current = gen;
      dispatch({ type: 'BUSY' });
      const current = () => generation.current === gen;
      try {
        const action = await task();
        if (current() && action) dispatch(action);
      } catch (error) {
        // The receipt already arrived: the pending handle is useless from now on.
        if (error?.code === 'INVALID_STATE') store.clear();
        if (current()) dispatch(failure(error));
      } finally {
        if (inFlight.current === gen) inFlight.current = null;
      }
    },
    [store],
  );

  const submitForm = useCallback(
    (values, lot) =>
      run(async () => {
        const result = await placeOrder(repository, store, {
          values,
          maxPerOrder: lot.maxPerOrder,
          lotSlug: lot.slug,
        });
        return result.errors
          ? { type: 'FIELD_ERRORS', errors: result.errors }
          : { type: 'ORDER_READY', order: result.order };
      }),
    [repository, store, run],
  );

  const sendReceipt = useCallback(
    (file) =>
      run(async () => {
        await submitReceipt(repository, store, state.order, file);
        return { type: 'DONE' };
      }),
    [repository, store, run, state.order],
  );

  const reset = useCallback(() => {
    generation.current++;
    store.clear();
    dispatch({ type: 'RESET' });
  }, [store]);

  const retryResume = useCallback(() => {
    dispatch({ type: 'RESUME_RETRY' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, submitForm, sendReceipt, reset, retryResume };
}
