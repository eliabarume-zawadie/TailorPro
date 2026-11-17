// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useOnlineStatus } from '../../src/data/online-status';

function Probe() { return <p>{useOnlineStatus() ? 'online' : 'offline'}</p>; }
afterEach(cleanup);

describe('useOnlineStatus', () => {
  it('follows the browser online and offline events', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    render(<Probe />);
    expect(screen.getByText('online')).toBeInTheDocument();
    act(() => { Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline')); });
    expect(screen.getByText('offline')).toBeInTheDocument();
    act(() => { Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true }); window.dispatchEvent(new Event('online')); });
    expect(screen.getByText('online')).toBeInTheDocument();
  });
});
