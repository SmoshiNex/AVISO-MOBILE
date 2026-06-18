# React Native Best Practices — AVISO Mobile

## Data Fetching

### No waterfalls — fetch in parallel
```ts
// Good
const [logs, contacts] = await Promise.all([
  api.get('/rider/hazard-logs'),
  api.get('/rider/emergency-contacts'),
]);

// Bad — sequential waterfall
const logs = await api.get('/rider/hazard-logs');
const contacts = await api.get('/rider/emergency-contacts');
```

### Always show loading / error / empty states
Every screen that fetches data must handle all three states:
```tsx
if (loading) return <ActivityIndicator />;
if (error) return <ErrorView message={error} onRetry={refetch} />;
if (data.length === 0) return <EmptyState />;
return <FlatList data={data} ... />;
```

## Lists

Always use `FlatList` (not `ScrollView + map`) for lists of dynamic data:
```tsx
<FlatList
  data={hazardLogs}
  keyExtractor={(item) => String(item.id)}
  renderItem={({ item }) => <HazardRow hazard={item} />}
/>
```

## Performance

- `useCallback` for functions passed as props to list items
- `useMemo` only when computation is measurably expensive (rare in RN)
- Do NOT add `useMemo`/`useCallback` speculatively — reanimated v4 handles most animation perf
- `React.memo` on list item components that receive stable props

## useEffect Rules

- One concern per `useEffect` — don't combine fetch + subscription + cleanup in one effect
- Always return a cleanup function when subscribing to sensors or timers:
```ts
useEffect(() => {
  const sub = Accelerometer.addListener(handler);
  return () => sub.remove();
}, []);
```

## Navigation

- Use `router.replace()` for auth redirects (no back button)
- Use `router.push()` for navigating deeper (back button available)
- Use `router.back()` to dismiss modals/detail screens
- Pass params via `router.push({ pathname, params })` — keep params minimal (IDs, not objects)

## State Management

- Component-local state for UI state (loading, error, modal open)
- No global state library needed — SecureStore for auth, API for data
- Derive state from data when possible; avoid duplicating server state in local state

## TypeScript

- No `any` — all API responses must be typed in `types/index.ts`
- Props interfaces always named `ComponentNameProps`
- Event handler params typed explicitly

## Keyboard

Always use `KeyboardAvoidingView` on auth screens with form inputs:
```tsx
<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
  <ScrollView>...</ScrollView>
</KeyboardAvoidingView>
```
