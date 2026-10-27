import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SeamlessVideoBackground from '../shared/components/SeamlessVideoBackground';

describe('SeamlessVideoBackground Component', () => {
  it('renders dual video buffers with seamless container', () => {
    render(<SeamlessVideoBackground src="/hero-forest-10s.mp4" />);

    const container = screen.getByTestId('seamless-video-bg');
    expect(container).toBeInTheDocument();

    const videoElements = container.querySelectorAll('video');
    expect(videoElements).toHaveLength(2);

    expect(videoElements[0]).toHaveAttribute('src', '/hero-forest-10s.mp4');
    expect(videoElements[1]).toHaveAttribute('src', '/hero-forest-10s.mp4');
  });
});
