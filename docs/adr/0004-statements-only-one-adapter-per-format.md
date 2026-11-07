# Statements only, one adapter per bank format, all or nothing

Decided: 2026-10-31

Each bank format has its own columns, date style and number style, and money read from the wrong column would be stored as fact. So import takes CSV statements only, through one adapter per format: Chase bank, Chase card and Commerzbank. An adapter recognizes its format by its exact header row, and a statement no adapter recognizes is refused. An upload of one or more statements is stored whole or not at all, so one bad row or file stores nothing. Pending rows are ignored, and so are rows dated after today. There's no column mapping, so a new bank or a changed format needs a code change. A sync source may come later.
