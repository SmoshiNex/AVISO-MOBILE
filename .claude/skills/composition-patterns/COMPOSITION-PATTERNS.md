# Composition Patterns — AVISO Mobile

## Avoid Boolean Prop Proliferation

**Bad** — boolean props that control variant behavior:
```tsx
<Button primary disabled loading large />
```

**Good** — explicit variant + composition:
```tsx
<PrimaryButton loading={isLoading} disabled={isSubmitting}>
  Log In
</PrimaryButton>
```

## Compound Components for Complex UI

When a component has multiple related parts, use compound pattern:
```tsx
// Instead of one component with 10 props
<Card
  title="Speed Bump"
  subtitle="Reported 2h ago"
  badge="Pending"
  onPress={...}
  showMap={true}
  mapCoords={...}
/>

// Use compound components
<HazardCard hazard={log} onPress={navigate}>
  <HazardCard.Badge status={log.status} />
  <HazardCard.Map lat={log.latitude} lng={log.longitude} />
</HazardCard>
```

## Context for Shared State

When multiple sibling components need the same state, lift to context:
```tsx
// Don't prop-drill emergency contacts through 3 levels
// Create EmergencyContactsContext and consume where needed
const { contacts, addContact } = useEmergencyContacts();
```

## Children Over Render Props

```tsx
// Good
<ScreenWrapper>
  <HazardForm />
</ScreenWrapper>

// Avoid render props unless children composition is truly insufficient
<ScreenWrapper render={(theme) => <HazardForm theme={theme} />} />
```

## Explicit Variants Instead of Boolean Modes

```tsx
// Bad
<StatusBadge active />
<StatusBadge pending />

// Good
<StatusBadge variant="active" />
<StatusBadge variant="pending" />

// Implementation
const VARIANT_STYLES = {
  active: { bg: '#22c55e', text: 'Active' },
  pending: { bg: '#f59e0b', text: 'Pending' },
  resolved: { bg: '#6b7280', text: 'Resolved' },
};
```

## Pressable Touch Targets

All tappable items must meet 44×44pt minimum:
```tsx
<Pressable style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}>
  <Text>Tap me</Text>
</Pressable>
```
