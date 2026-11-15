Integration checkpoint (NOT validated; do not merge to main).

Base: v3.0.1 ed466f9db71292e912d8d0160e689a67a994f2d9.
Fork source: c10969cdba2201e22fc3529fbf61af0d6903b77f, common ancestor 7026cc6526fa637611d05804a4cec8eed04de017.

Transferred 51 fork-modified files that have NO upstream changes relative to the common ancestor. Their original blobs are preserved unchanged, including climate modules, river-travel, diagnostic tests, and documentation. This is a partial tree-level transplant, not a Git merge of the 57 commits.

5 shared paths must undergo a proper 3-way reconciliation:
- README.md
- v2/README.md (auto-merges according to previous merge-tree)
- v2/js/finish/finish-config.js
- v2/js/finish/finish-hydro.js
- v2/js/finish/finish.js

Hydrology, lake salt balance, seasonal discharge and v3 finish pipeline integration are NOT validated. The old 0r063N exporter remains incompatible with v3 worker data; canonical dataset c10969c is UNCHANGED. Never adopt this checkpoint as canonical.
Source report: oWilsonBarbosa/0r063N reports/generator-v3/README.md, commit acd4ed9.