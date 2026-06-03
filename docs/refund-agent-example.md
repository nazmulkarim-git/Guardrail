# Refund Agent Example

The example in `examples/refund-agent-node` simulates this workflow:

1. AI support agent wants to issue a `$500` refund.
2. Company policy requires human approval over `$250`.
3. Agent calls `forsig.escalate()`.
4. A reviewer opens Forsig and approves, rejects, edits, or takes over.
5. The example prints the final decision.

Run:

```bash
cd examples/refund-agent-node
npm install
FORSIG_API_KEY=fsk_test_xxx FORSIG_BASE_URL=https://www.forsig.com npm start
```
