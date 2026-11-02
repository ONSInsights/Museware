import { COMPONENT_SPECS } from '../types/library';

/** Generated once from the same definitions the inspector uses. */
export const BUILDER_PROPS_PRIMER = COMPONENT_SPECS.map((spec) => {
  const seen = new Set<string>();
  const props = spec.props.map((prop) => {
    seen.add(prop.key);
    const defaultValue =
      prop.defaultValue !== undefined ? prop.defaultValue : spec.defaultProps[prop.key];
    const detail = [
      prop.kind,
      prop.kind === 'data' ? `hint=${JSON.stringify(prop.hint)}` : '',
      prop.options?.length ? `enum=${JSON.stringify(prop.options)}` : '',
      defaultValue !== undefined ? `default=${JSON.stringify(defaultValue)}` : '',
      prop.required ? 'required' : '',
      prop.min !== undefined ? `min=${prop.min}` : '',
      prop.max !== undefined ? `max=${prop.max}` : '',
    ]
      .filter(Boolean)
      .join(';');
    return `${prop.key}(${detail})`;
  });
  for (const [key, value] of Object.entries(spec.defaultProps))
    if (!seen.has(key)) props.push(`${key}(default=${JSON.stringify(value)})`);
  return `${spec.type}{${props.join(', ')}}`;
}).join('\n');
