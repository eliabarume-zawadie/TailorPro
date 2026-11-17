// @vitest-environment jsdom
// Design-system component behaviour: accessibility semantics, states and focus handling.
// Colour contrast cannot be computed in jsdom; it is checked in a real browser by tests/e2e/a11y.spec.ts.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge, Banner, Button, EmptyState, SelectField, Stitch, TextField } from '../../src/ui/components';
import { Dialog } from '../../src/ui/dialog';
import { ToastProvider, useToast } from '../../src/ui/toast';

afterEach(cleanup);

describe('TextField', () => {
  it('links label, hint and error to the input and marks it invalid', () => {
    render(<TextField id="phone" label="Phone number" hint="Example: +265 999 123 456" error="Enter a phone number." value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Phone number');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby')!.split(' ');
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual(['Example: +265 999 123 456', 'Enter a phone number.']);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a phone number.');
  });
  it('is not marked invalid and has no alert when there is no error', () => {
    render(<TextField id="name" label="Name" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('reports typing through onChange', async () => {
    const onChange = vi.fn();
    render(<TextField id="n" label="Name" value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Name'), 'A');
    expect(onChange).toHaveBeenCalledWith('A');
  });
});

describe('SelectField', () => {
  it('has an accessible name and its options', () => {
    render(<SelectField id="t" label="Business type" value="" onChange={() => {}} options={[{ value: '', label: 'Choose…' }, { value: 'a', label: 'Alpha' }]} />);
    const select = screen.getByLabelText('Business type');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'Alpha']);
  });
});

describe('Button', () => {
  it('while busy it is disabled and announces busy', () => {
    render(<Button busy>Create business</Button>);
    const b = screen.getByRole('button', { name: 'Create business' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
  });
  it('is a normal button when not busy', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-busy');
  });
});

describe('Banner, Badge, EmptyState', () => {
  it('errors are alerts; information and success are polite status messages', () => {
    render(<><Banner kind="error">Bad</Banner><Banner kind="info">Info</Banner><Banner kind="success">Done</Banner></>);
    expect(screen.getByRole('alert')).toHaveTextContent('Bad');
    expect(screen.getAllByRole('status').map((e) => e.textContent)).toEqual(['Info', 'Done']);
  });
  it('a badge shows its meaning in words, not colour alone', () => {
    render(<><Badge tone="offline">Offline</Badge><Badge tone="online">Online</Badge></>);
    expect(screen.getByText('Offline')).toBeVisible();
    expect(screen.getByText('Online')).toBeVisible();
  });
  it('an empty state has a heading, an explanation and an action', () => {
    render(<EmptyState title="No customers yet" body="Add your first customer to begin." action={<Button>Add customer</Button>} />);
    expect(screen.getByRole('heading', { name: 'No customers yet' })).toBeVisible();
    expect(screen.getByText('Add your first customer to begin.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add customer' })).toBeVisible();
  });
  it('a stitch divider is decorative', () => {
    const { container } = render(<Stitch />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

function DialogHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} title="Discard changes?" closeLabel="Keep editing" onClose={() => { onClose(); setOpen(false); }}>
        <p>Your changes will be lost.</p>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('is hidden when closed and is a named dialog when open', async () => {
    render(<DialogHarness onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
    expect(screen.getByText('Your changes will be lost.')).toBeVisible();
  });
  it('closes with Escape and returns focus to the control that opened it', async () => {
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
  it('closes with its close button', async () => {
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('moves focus into the dialog when it opens', async () => {
    render(<DialogHarness onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });
});

function ToastHarness() {
  const toast = useToast();
  return <button onClick={() => toast.show('Profile saved.')}>Save</button>;
}

describe('Toast', () => {
  it('announces a message in a polite live region and removes it after a few seconds', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastHarness /></ToastProvider>);
    act(() => { screen.getByRole('button', { name: 'Save' }).click(); });
    expect(screen.getByRole('status')).toHaveTextContent('Profile saved.');
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.queryByText('Profile saved.')).toBeNull();
    vi.useRealTimers();
  });
  it('the live region exists before any message so screen readers announce the first one', () => {
    render(<ToastProvider><div /></ToastProvider>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('automated accessibility check (axe)', () => {
  it('a form built from the components has no violations', async () => {
    const { container } = render(
      <main>
        <h1>Set up your business</h1>
        <form>
          <TextField id="a" label="Business name" hint="Shown to staff" value="" onChange={() => {}} />
          <TextField id="b" label="Phone number" error="Enter a phone number." value="x" onChange={() => {}} />
          <SelectField id="c" label="Business type" value="" onChange={() => {}} options={[{ value: '', label: 'Choose…' }, { value: 'x', label: 'X' }]} />
          <Banner kind="error">Please fix the highlighted fields.</Banner>
          <Badge tone="offline">Offline</Badge>
          <Button type="submit">Create business</Button>
        </form>
        <EmptyState title="Nothing here yet" body="Add something." />
      </main>,
    );
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
