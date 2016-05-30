# JavaScript formula parser

Simple formula parser written in JavaScript

## Features

* custom operators and functions
* simple API (see usage)
* no further dependencies

## Usage

```
<script type="text/javascript" src="forumlaparser.js"></script>
```

```
var parser = new FormulaParser();
var evaluator = new parser.Evaluator();

// set expression
evaluator.expr = "a + b * 5";

// optional: use default operators and functions (+, -, *, /, ...)
evaluator.defaultSetup();

// optinal: add additional operators or functions
evaluator.operatorDefinitions.push(
  new parser.OperatorDefinition("~", "my operator", 1900, function(foo, bar) { return (foo + bar) * (foo - bar); })
);

// optional: set placeholder values
evaluator.placeholderValues = {
  a: 1,
  b: 2
};

try {
  // compile and run
  evaluator.compile();
  var result = evaluator.evaluate(); // result === 11

  // changing placeholder values doesn't require recompiling
  evaluator.placeholderValues = { ... };
  var result2 = evaluator.evaluate();

} catch(e) {
  // error handling
  var errorColumn = e.token.offset;
  var errorMessage = e.message;
}
```
