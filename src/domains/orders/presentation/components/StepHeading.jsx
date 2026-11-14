import { useEffect, useRef } from 'react';

// Each step announces itself: focus lands on its heading when the step mounts.
export default function StepHeading({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h3
      ref={ref}
      tabIndex={-1}
      className="text-lg font-serif font-normal text-sand-50 focus:outline-none"
    >
      {children}
    </h3>
  );
}
