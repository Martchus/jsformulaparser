FormulaParser = function() {
    var parser = this;

    this.TokenType = {
        open: 0,
        close: 1,
        separator: 2,
        operator: 3,
        func: 4,
        arg: 5,
        placeholder: 6,
        literal: 7,
        parent: 8
    };

    this.Token = function(expr, offset, type) {
        this.expr = expr;
        this.type = type;
        this.offset = offset;

        this.computeValue = function() {
            throw new parser.ParsingError("token value can not be computed", this);
        };
    };

    this.callTokenConstructor = function(derived, expr, offset, tokenType) {
        this.Token.prototype.constructor.call(derived, expr, offset, tokenType);
    };

    this.deriveFromToken = function(constructor) {
        var obj = constructor;
        obj.prototype = new parser.Token();
        obj.prototype.constructor = constructor;
        return obj;
    };

    this.OpenToken = this.deriveFromToken(function(expr, offset) {
        parser.callTokenConstructor(this, expr, offset, parser.TokenType.open);
    });

    this.CloseToken = this.deriveFromToken(function(expr, offset) {
        parser.callTokenConstructor(this, expr, offset, parser.TokenType.close);
    });

    this.SeparatorToken = this.deriveFromToken(function(expr, offset) {
        parser.callTokenConstructor(this, expr, offset, parser.TokenType.separator);
    });

    this.OperatorToken = this.deriveFromToken(function(expr, offset) {
        parser.callTokenConstructor(this, expr, offset, parser.TokenType.operator);
    });

    this.FunctionToken = this.deriveFromToken(function(expr, offset) {
        parser.callTokenConstructor(this, expr, offset, parser.TokenType.func);
    });

    this.ArgumentToken = this.deriveFromToken(function(expr, offset) {
        parser.callTokenConstructor(this, expr, offset, parser.TokenType.arg);
        this.computeValue = function() {
            return expr;
        };
    });

    this.PlaceholderToken = this.deriveFromToken(function(expr, offset) {
        parser.callTokenConstructor(this, expr, offset, parser.TokenType.placeholder);
        this.computeValue = function(placeholderValues) {
            if (placeholderValues) {
                var value = placeholderValues[this.expr];
                if (value != undefined) {
                    return value;
                }
            }
            throw new parser.ParsingError("variable " + this.expr + " can not be resolved", this);
        };
    });

    this.LiteralToken = this.deriveFromToken(function(expr, offset) {
        parser.callTokenConstructor(this, expr, offset, parser.TokenType.literal);
        this.computeValue = function() {
            return this.expr;
        }
    });

    this.OperatorParent = this.deriveFromToken(function(operatorToken, lhsToken, rhsToken) {
        var expr = [];
        if (!operatorToken.expr.rhsOnly) {
            expr.push(lhsToken.expr);
        }
        expr.push(operatorToken.expr);
        expr.push(rhsToken.expr);
        parser.callTokenConstructor(this, expr.join(" "), operatorToken.expr.rhsOnly ? operatorToken.offset : lhsToken.offset, parser.TokenType.parent);
        this.operatorToken = operatorToken;
        this.lhsToken = lhsToken;
        this.rhsToken = rhsToken;
        this.computeValue = function(placeholderValues) {
            if (this.operatorToken.expr.rhsOnly) {
                return this.operatorToken.expr.func(this.rhsToken.computeValue(placeholderValues));
            } else {
                return this.operatorToken.expr.func(this.lhsToken.computeValue(placeholderValues), this.rhsToken.computeValue(placeholderValues));
            }
        };
    });

    this.FunctionParent = this.deriveFromToken(function(functionToken, argumentToken) {
        parser.callTokenConstructor(this, [functionToken.expr, argumentToken.expr].join(" "), functionToken.offset, parser.TokenType.parent);
        this.functionToken = functionToken;
        this.argumentToken = argumentToken;
        this.computeValue = function(placeholderValues) {
            var args = this.argumentToken.computeValue(placeholderValues);
            var computedArgs = [];
            if (!Array.isArray(args)) {
                computedArgs.push(args);
            } else {
                for (var i = 0; i < args.length; ++i) {
                    computedArgs.push(args[i].computeValue(placeholderValues));
                }
            }
            if (this.functionToken.expr.requiredArguments === computedArgs.length) {
                return this.functionToken.expr.func.apply(null, computedArgs);
            } else {
                throw new parser.ParsingError(this.functionToken.expr.name + ": invalid number of arguments given (" + this.FunctionToken.expr.requiredArguments + " required but " + computedArgs.length + " specified)", (Array.isArray(args) && args.length > 0) ? args[args.length - 1] : this.argumentToken);
            }
        };
    });

    this.OperatorDefinition = function(symbol, name, precedence, func, rhsOnly) {
        this.symbol = symbol;
        this.name = name;
        this.precedence = precedence;
        this.func = func;
        this.rhsOnly = rhsOnly === undefined ? false : rhsOnly;
    };

    this.FunctionDefinition = function(name, func, requiredArguments) {
        this.name = name;
        this.func = func;
        this.requiredArguments = requiredArguments;
    };

    this.ParsingError = function(message, token) {
        this.message = message;
        this.token = token;
    }

    this.Character = function(value) {
        this.value = value;
        this.isWhitespace = function() {
            return this.value === ' ' || this.value === '\t' || this.value === '\n';
        };
        this.isDigit = function() {
            return this.value >= '0' && this.value <= '9';
        };
        this.isDecimalPoint = function() {
            return this.value === '.';
        };
        this.isSeparator = function() {
            return this.value === ',';
        };
        this.isOpening = function() {
            return this.value === '(';
        };
        this.isClosing = function() {
            return this.value === ')';
        };
        this.isOperatorChar = function(operatorDefinitions) {
            for (var i1 = 0; i1 < operatorDefinitions.length; ++i1) {
                for (var i2 = 0; i2 < operatorDefinitions[i1].symbol.length; ++i2) {
                    if (this.value === operatorDefinitions[i1].symbol.charAt(i2)) {
                        return true;
                    }
                }
            }
            return false;
        };
        this.isSpecial = function(operatorDefinitions) {
            return this.isWhitespace() || this.isDecimalPoint() || this.isSeparator() || this.isOpening() || this.isClosing() || this.isOperatorChar(operatorDefinitions);
        };
    };

    this.Evaluator = function() {
        this.expr = undefined;
        this.tokens = undefined;
        this.compiledToken = undefined;
        this.placeholderValues = {};
        this.operatorDefinitions = [];
        this.functionDefinitions = [];

        this.defaultSetup = function() {
            this.operatorDefinitions = parser.logicalOperatorDefinitions.concat(parser.arithmeticalOperatorDefinitions);
            this.functionDefinitions = parser.logicalFunctionDefinitions;
        };

        this.compile = function() {
            if (typeof this.expr === "string" && this.expr.length) {
                this.tokenizeExpression();
                this.compileTokens();
            } else {
                throw new parser.ParsingError("the expression is empty/invalid");
            }
        };

        this.evaluate = function() {
            if (this.compiledToken) {
                return this.compiledToken.computeValue(this.placeholderValues);
            } else {
                throw new parser.ParsingError("the expression has not been compiled yet");
            }
        };

        this.matchFunction = function(startIndex) {
            for (var i = 0; i < this.functionDefinitions.length; ++i) {
                if (this.expr.indexOf(this.functionDefinitions[i].name, startIndex) === startIndex) {
                    return this.functionDefinitions[i];
                }
            }
            return false;
        };

        this.matchOperator = function(startIndex) {
            for (var i = 0; i < this.operatorDefinitions.length; ++i) {
                if (this.expr.indexOf(this.operatorDefinitions[i].symbol, startIndex) === startIndex) {
                    return this.operatorDefinitions[i];
                }
            }
            return false;
        };

        this.tokenizeExpression = function() {
            this.tokens = [];
            for (var i = 0; i < this.expr.length;) {
                var char = new parser.Character(this.expr.charAt(i));
                if (char.isWhitespace()) {
                    var end = i + 1;
                    for (; end < this.expr.length && (new parser.Character(this.expr.charAt(end))).isWhitespace(); ++end);
                    i = end; /* discard whitespaces */
                } else if (char.isDigit() || char.isDecimalPoint()) {
                    var end = i + 1;
                    var decimalPointFound = char.isDecimalPoint();
                    for (; end < this.expr.length; ++end) {
                        var char = new parser.Character(this.expr.charAt(end));
                        if (!(char.isDigit() || (char.isDecimalPoint() && !decimalPointFound))) {
                            break;
                        }
                        decimalPointFound = decimalPointFound || char.isDecimalPoint();
                    }
                    this.tokens.push(new parser.LiteralToken(parseFloat(this.expr.substring(i, end)), i)); /* add literal token */
                    i = end;
                } else if (char.isOpening()) {
                    this.tokens.push(new parser.OpenToken(char.value, i++));
                } else if (char.isClosing()) {
                    this.tokens.push(new parser.CloseToken(char.value, i++));
                } else if (char.isSeparator()) {
                    this.tokens.push(new parser.SeparatorToken(char.value, i++));
                } else if (char.isOperatorChar(this.operatorDefinitions)) {
                    var operator = this.matchOperator(i);
                    if (operator) { /* is operator */
                        this.tokens.push(new parser.OperatorToken(operator, i)); /* add operator token */
                        i += operator.symbol.length;
                    } else { /* invalid placeholder (containing operator symbols) */
                        throw new parser.ParsingError("invalid parser.Character in placeholder", new parser.PlaceholderToken(this.expr.substr(i, 1)));
                    }
                } else { /* is placeholder or a function */
                    var end = i + 1;
                    for (; end < this.expr.length && !(new parser.Character(this.expr.charAt(end))).isSpecial(this.operatorDefinitions); ++end);
                    var func = this.matchFunction(i);
                    if (func) { /* it is actually a function */
                        this.tokens.push(new parser.FunctionToken(func, i)); /* add function token */
                    } else { /* it is a placeholder */
                        this.tokens.push(new parser.PlaceholderToken(this.expr.substring(i, end), i)); /* add placeholder token */
                    }
                    i = end;
                }
            }
        };

        this.compileTokens = function(tokens) {
            var copy = this.tokens.slice();
            this.dissolveBraces(copy);
            this.compiledToken = this.simplifyTokens(copy);
        };

        this.simplifyTokens = function(tokens, offset, length) {
            if (offset === undefined) {
                offset = 0;
            }
            if (length === undefined || (offset + length) > tokens.length) {
                length = tokens.length;
            }
            /* from groups by eliminating separators */
            var tokenGroups = [];
            var currentGroup = [];
            for (var i = offset; i < offset + length; ++i) {
                var token = tokens[i];
                switch (token.type) {
                    case parser.TokenType.separator:
                        if (currentGroup.length) {
                            tokenGroups.push(currentGroup);
                        } else {
                            throw new parser.ParsingError("unexpected separator token", token);
                        }
                        currentGroup = []
                        break;
                    case parser.TokenType.open:
                        /* open tokens should have been eliminated already */
                        throw new parser.ParsingError("unexpected opening token", token);
                    case parser.TokenType.close:
                        /* close tokens should have been eliminated already */
                        throw new parser.ParsingError("unexpected closing token", token);
                    default:
                        currentGroup.push(token);
                }
            }
            if (currentGroup.length) {
                tokenGroups.push(currentGroup);
            } else if (tokenGroups.length) {
                throw new parser.ParsingError("unexpected seaparator token at end", tokens[length - 1]);
            } else {
                return new parser.ArgumentToken([], offset);
            }
            /* simplify each group */
            for (var gi = 0; gi < tokenGroups.length; ++gi) {
                var tokenGroup = tokenGroups[gi];
                /* replace functions and arguments with function parents */
                for (var i = tokenGroup.length - 1; i >= 0; --i) {
                    var token = tokenGroup[i];
                    if (token.type === parser.TokenType.func) {
                        if (i < tokenGroup.length - 1) {
                            var parentToken = new parser.FunctionParent(token, tokenGroup[i + 1]);
                            tokenGroup.splice(i, 2, parentToken); /* replace the function token and the next token (argument) with the parent token */
                        } else {
                            throw new parser.ParsingError(token.expr.requiredArguments + " argument(s) expected", token);
                        }
                    }
                }
                /* replace operators, lvalues and rvalues with operator parents */
                for (var highestPrecedenceIndex, highestPrecedence;;) {
                    highestPrecedenceIndex = -1;
                    highestPrecedence = 0;
                    for (var i = 0; i < tokenGroup.length; ++i) {
                        var token = tokenGroup[i];
                        if (token.type === parser.TokenType.operator) {
                            var precedence = token.expr.precedence;
                            if (highestPrecedenceIndex < 0 || precedence > highestPrecedence) {
                                highestPrecedenceIndex = i;
                                highestPrecedence = precedence;
                            }
                        }
                    }
                    if (highestPrecedenceIndex >= 0) {
                        var operatorToken = tokenGroup[highestPrecedenceIndex];
                        var operatorDef = operatorToken.expr;
                        if (highestPrecedenceIndex + 1 < tokenGroup.length) {
                            var lvalue = undefined;
                            var rvalue = tokenGroup[highestPrecedenceIndex + 1];
                            var first = highestPrecedenceIndex;
                            var length = 2;
                            if (!operatorDef.rhsOnly) {
                                if (highestPrecedenceIndex > 0) {
                                    lvalue = tokenGroup[highestPrecedenceIndex - 1];
                                    --first;
                                    ++length;
                                } else {
                                    throw new parser.ParsingError("lvalue expected", operatorToken);
                                }
                            }
                            var parentToken = new parser.OperatorParent(operatorToken, lvalue, rvalue);
                            tokenGroup.splice(first, length, parentToken); /* replace the operator token and value tokens with the parent token */
                        } else {
                            throw new parser.ParsingError("rvalue expected", operatorToken);
                        }
                    } else {
                        break;
                    }
                }
                /* only one token should be left */
                if (tokenGroup.length !== 1) {
                    throw new parser.ParsingError("operator expected", tokenGroup[1]);
                }
            }
            /* return results */
            if (tokenGroups.length > 1) {
                /* there are more groups -> return an argument token */
                var args = [];
                for (var gi = 0; gi < tokenGroups.length; ++gi) {
                    args.push(tokenGroups[gi][0]);
                }
                return new parser.ArgumentToken(args, tokenGroups[0][0].offset);
            } else {
                /* there is only a singe group -> return the simplified token */
                return tokenGroups[0][0];
            }
        };

        this.dissolveBraces = function(tokens, offset, length) {
            if (offset === undefined) {
                offset = 0;
            }
            if (length === undefined || (offset + length) > tokens.length) {
                length = tokens.length;
            }
            var openIndexes = [];
            for (var i = offset;
                (i < offset + length) && i < (tokens.length); ++i) {
                var token = tokens[i];
                switch (token.type) {
                    case parser.TokenType.open:
                        openIndexes.push(i);
                        break;
                    case parser.TokenType.close:
                        if (openIndexes.length) {
                            var openIndex = openIndexes.pop();
                            var simplified = this.simplifyTokens(tokens, openIndex + 1, i - openIndex - 1);
                            tokens.splice(openIndex, i - openIndex + 1, simplified);
                            if (openIndexes.length) {
                                i = openIndexes[openIndexes.length - 1];
                            } else {
                                i = -1;
                            }
                        } else {
                            throw new parser.ParsingError("unexpected closing token", token);
                        }
                        break;
                }
            }
        };
    };

    this.logicalOperatorDefinitions = [
        new this.OperatorDefinition("!", "negation", 1000, function(foo) {
            return !foo;
        }, true),
        new this.OperatorDefinition("&", "conunction", 900, function(foo, bar) {
            return foo && bar;
        }),
        new this.OperatorDefinition("|", "disjunction", 800, function(foo, bar) {
            return foo || bar;
        }),
        new this.OperatorDefinition("^", "exclusive disjunction", 800, function(foo, bar) {
            return (foo && !bar) || (!foo && bar);
        }),
        new this.OperatorDefinition("->", "consequence", 700, function(foo, bar) {
            return !(foo && !bar);
        }),
        new this.OperatorDefinition("=", "biconditional", 600, function(foo, bar) {
            return foo === bar;
        })
    ];

    this.arithmeticalOperatorDefinitions = [
        new this.OperatorDefinition("+", "sum", 1900, function(foo, bar) {
            return foo + bar;
        }),
        new this.OperatorDefinition("-", "difference", 1900, function(foo, bar) {
            return foo - bar;
        }),
        new this.OperatorDefinition("*", "product", 2000, function(foo, bar) {
            return foo * bar;
        }),
        new this.OperatorDefinition("/", "division", 2000, function(foo, bar) {
            return foo / bar;
        }),
        new this.OperatorDefinition("%", "modulo", 2000, function(foo, bar) {
            return foo % bar;
        }),
    ];

    this.logicalFunctionDefinitions = [
        new this.FunctionDefinition("not", function(foo) {
            return !foo;
        }, 1),
        new this.FunctionDefinition("and", function(foo, bar) {
            return foo && bar;
        }, 2),
        new this.FunctionDefinition("or", function(foo, bar) {
            return foo || bar;
        }, 2),
        new this.FunctionDefinition("xor", function(foo, bar) {
            return (foo && !bar) || (!foo && bar);
        }, 2),
        new this.FunctionDefinition("con", function(foo, bar) {
            return !(foo && !bar);
        }, 2),
        new this.FunctionDefinition("equ", function(foo, bar) {
            return foo === bar;
        }, 2)
    ];

};
