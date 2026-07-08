create policy "Allow public insert to contacts"
  on public.contacts
  for insert
  to anon, authenticated
  with check (true);
