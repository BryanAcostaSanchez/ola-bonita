-- Whoever can open Configuración → Pagos can save the terminal there. Until now
-- only the owner could write it, so anyone else with the payments permission
-- filled the form and got a row-level security error on save.
drop policy if exists "owners manage payment terminals" on public.payment_terminals;
drop policy if exists "payments managers manage payment terminals" on public.payment_terminals;
create policy "payments managers manage payment terminals" on public.payment_terminals
  for all to authenticated
  using (public.is_owner() or public.has_permission('settings.payments'))
  with check (public.is_owner() or public.has_permission('settings.payments'));

-- Clip reports serials in capitals with no spaces or dashes. One typed as it
-- reads on the sticker never matched, so the terminal looked unknown to Clip.
update public.payment_terminals terminal
set device_id = upper(regexp_replace(terminal.device_id, '[^A-Za-z0-9]', '', 'g')), updated_at = now()
where terminal.device_id <> upper(regexp_replace(terminal.device_id, '[^A-Za-z0-9]', '', 'g'))
  and not exists (
    select 1 from public.payment_terminals other
    where other.provider = terminal.provider
      and other.id <> terminal.id
      and other.device_id = upper(regexp_replace(terminal.device_id, '[^A-Za-z0-9]', '', 'g'))
  );
