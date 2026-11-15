// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DecimalInput from '../../src/lib/components/shared/DecimalInput.svelte';
import InstitutionInput from '../../src/lib/components/shared/InstitutionInput.svelte';
import MoneyInput from '../../src/lib/components/shared/MoneyInput.svelte';
import PercentInput from '../../src/lib/components/shared/PercentInput.svelte';

afterEach(cleanup);

describe('shared input auto-selection and replacement', () => {
  describe('MoneyInput', () => {
    it('calls select on focus', async () => {
      const { container } = render(MoneyInput, { value: 0, dollarSign: true });
      const input = container.querySelector('input')!;
      expect(input.value).toBe('$0');

      const selectSpy = vi.spyOn(input, 'select');
      await fireEvent.focus(input);
      expect(selectSpy).toHaveBeenCalledTimes(1);
    });

    it('calls preventDefault and retains selection on mouseup following focus', async () => {
      const { container } = render(MoneyInput, { value: 0, dollarSign: true });
      const input = container.querySelector('input')!;
      const selectSpy = vi.spyOn(input, 'select');

      // Click to focus: mousedown -> focus -> mouseup
      await fireEvent.mouseDown(input);
      await fireEvent.focus(input);
      expect(selectSpy).toHaveBeenCalledTimes(1);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      input.dispatchEvent(mouseUpEvent);
      expect(mouseUpEvent.defaultPrevented).toBe(true);
      expect(selectSpy).toHaveBeenCalledTimes(2);

      // Second click while already focused: should NOT call preventDefault or select
      const secondMouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      input.dispatchEvent(secondMouseUp);
      expect(secondMouseUp.defaultPrevented).toBe(false);
      expect(selectSpy).toHaveBeenCalledTimes(2);
    });

    it('replaces default $0 when typing a new amount and formats on blur', async () => {
      let boundValue: number | null | undefined = 0;
      const { container } = render(MoneyInput, {
        value: boundValue,
        dollarSign: true,
      });
      const input = container.querySelector('input')!;
      expect(input.value).toBe('$0');

      // User clicks and focuses the field
      await fireEvent.focus(input);
      await fireEvent.mouseUp(input);

      // Typing 1000 replaces $0
      await fireEvent.input(input, { target: { value: '1000' } });
      expect(input.value).toBe('1000');

      await fireEvent.blur(input);
      expect(input.value).toBe('$1,000');
    });

    it('sanitizes leading zero if typing occurs without replacing initial 0 (e.g. $0400 -> $400)', async () => {
      const { container } = render(MoneyInput, { value: 0, dollarSign: true });
      const input = container.querySelector('input')!;
      expect(input.value).toBe('$0');

      await fireEvent.focus(input);
      // Simulate input if cursor was placed after 0 and user typed 400
      await fireEvent.input(input, { target: { value: '$0400' } });
      expect(input.value).toBe('$400');

      await fireEvent.blur(input);
      expect(input.value).toBe('$400');
    });

    it('sanitizes plain leading zero (0400 -> 400)', async () => {
      const { container } = render(MoneyInput, { value: 0, dollarSign: false });
      const input = container.querySelector('input')!;
      expect(input.value).toBe('0');

      await fireEvent.focus(input);
      await fireEvent.input(input, { target: { value: '0400' } });
      expect(input.value).toBe('400');

      await fireEvent.blur(input);
      expect(input.value).toBe('400');
    });
  });

  describe('PercentInput', () => {
    it('calls select on focus and mouseup with preventDefault', async () => {
      const { container } = render(PercentInput, { value: 0 });
      const input = container.querySelector('input')!;
      expect(input.value).toBe('0%');

      const selectSpy = vi.spyOn(input, 'select');
      await fireEvent.focus(input);
      expect(selectSpy).toHaveBeenCalledTimes(1);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      input.dispatchEvent(mouseUpEvent);
      expect(mouseUpEvent.defaultPrevented).toBe(true);
      expect(selectSpy).toHaveBeenCalledTimes(2);
    });

    it('sanitizes leading zero (015 -> 15)', async () => {
      const { container } = render(PercentInput, { value: 0 });
      const input = container.querySelector('input')!;
      await fireEvent.focus(input);
      await fireEvent.input(input, { target: { value: '015' } });
      expect(input.value).toBe('15');
      await fireEvent.blur(input);
      expect(input.value).toBe('15%');
    });
  });

  describe('DecimalInput', () => {
    it('calls select on focus and mouseup with preventDefault', async () => {
      const { container } = render(DecimalInput, { value: 0 });
      const input = container.querySelector('input')!;
      expect(input.value).toBe('0');

      const selectSpy = vi.spyOn(input, 'select');
      await fireEvent.focus(input);
      expect(selectSpy).toHaveBeenCalledTimes(1);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      input.dispatchEvent(mouseUpEvent);
      expect(mouseUpEvent.defaultPrevented).toBe(true);
      expect(selectSpy).toHaveBeenCalledTimes(2);
    });

    it('sanitizes leading zero (025.4 -> 25.4)', async () => {
      const { container } = render(DecimalInput, { value: 0 });
      const input = container.querySelector('input')!;
      await fireEvent.focus(input);
      await fireEvent.input(input, { target: { value: '025.4' } });
      expect(input.value).toBe('25.4');
      await fireEvent.blur(input);
      expect(input.value).toBe('25.4');
    });
  });

  describe('InstitutionInput', () => {
    it('calls select on focus and mouseup with preventDefault for initial click', async () => {
      const { container } = render(InstitutionInput, { value: '[To be added]' });
      const input = container.querySelector('input')!;
      expect(input.value).toBe('[To be added]');

      const selectSpy = vi.spyOn(input, 'select');
      await fireEvent.focus(input);
      expect(selectSpy).toHaveBeenCalledTimes(1);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      input.dispatchEvent(mouseUpEvent);
      expect(mouseUpEvent.defaultPrevented).toBe(true);
      expect(selectSpy).toHaveBeenCalledTimes(2);
    });

    it('selects entire [To be added] on click/mouseup even when already focused', async () => {
      const { container } = render(InstitutionInput, { value: '[To be added]' });
      const input = container.querySelector('input')!;
      const selectSpy = vi.spyOn(input, 'select');

      // Initial focus
      await fireEvent.focus(input);
      const firstMouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      input.dispatchEvent(firstMouseUp);
      expect(selectSpy).toHaveBeenCalledTimes(2);

      // Second click while already focused: because value is still "[To be added]", should select again
      const secondMouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      input.dispatchEvent(secondMouseUp);
      expect(secondMouseUp.defaultPrevented).toBe(true);
      expect(selectSpy).toHaveBeenCalledTimes(3);
    });

    it('allows typing a new institution name to replace [To be added]', async () => {
      let val = '[To be added]';
      const { container } = render(InstitutionInput, {
        value: val,
      });
      const input = container.querySelector('input')!;
      expect(input.value).toBe('[To be added]');

      await fireEvent.focus(input);
      await fireEvent.input(input, { target: { value: 'Fidelity' } });
      expect(input.value).toBe('Fidelity');

      await fireEvent.blur(input);
      expect(input.value).toBe('Fidelity');
    });

    it('allows normal cursor positioning on subsequent clicks once a custom institution is typed', async () => {
      const { container } = render(InstitutionInput, { value: 'Vanguard' });
      const input = container.querySelector('input')!;
      const selectSpy = vi.spyOn(input, 'select');

      // Initial focus: selects all
      await fireEvent.focus(input);
      const firstMouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      input.dispatchEvent(firstMouseUp);
      expect(firstMouseUp.defaultPrevented).toBe(true);
      expect(selectSpy).toHaveBeenCalledTimes(2);

      // Subsequent click while focused: normal cursor placement (no preventDefault, no force-select)
      const secondMouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      input.dispatchEvent(secondMouseUp);
      expect(secondMouseUp.defaultPrevented).toBe(false);
      expect(selectSpy).toHaveBeenCalledTimes(2);
    });
  });
});
