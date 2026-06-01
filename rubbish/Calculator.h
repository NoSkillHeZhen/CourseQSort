#pragma once
#include "Stack.h"
#include "polynomial.h"
#include "header.h"
using namespace std;

template<typename T>
// Support Int, Double, Polynomial
class Calculator{
    public:
        Calculator();
        // Initialize the id of each valid symbol
        ~Calculator() = default;
        T run();
        // Input a formula and return its result
        // Throws:
        //    invalid_argument if input wrong symbol
        //    invalid_argument if divided by zero
        //    out_of_range if the formula is too long
    private:
        bool isNumber(char x) const;
        // Check whether x is a digit
        bool isNum(char x) const;
        // bool isNum<Polynomial>(char x):
        //    return true only if x is digit or "x"
        // bool isNum<T>(char x):
        //    return true only if x is digit
        bool isSymbol(char x) const;
        // Check whether x is a valid symbol
        int getInteger(char ch, bool isNegative) const;
        // Input and return an integer
        // Parameters:
        //    char ch: the first digit of the integer
        double getDouble(char ch, bool isNegative) const;
        // Input and return a decimal(double)
        // Parameters:
        //    char ch: the first digit of the integer
        T getNum(char ch, bool isNegative) const;
        // Input and return an item, it can be Int, Double, Polynomial
        T safeDivider(T num1, T num2) const;
        // Throw:
        //    invalid_argument if divided by Polynomial
        //    invalid_argument if divided by 0
        void calOnce();
        // Calculate the top two numbers and the top operator
        // and then push the result into the number stack
        const char SYMBOL[10] = { '+', '-', '*', '/', '(', ')', '[', ']', '{', '}' };
        // The list of valid symbols
        const int PRORTY[10][10] = { // PRIORITY[pre][x]
            { 1, -1, -1, 1 }, // pre == '+', '-'
            { 1, 1, -1, 1 }, // pre == '*', '/'
            { -1, -1, -1, 0 }, // pre == '('
            { 1, 1, -2, 1 } // pre == ')'
        };
        // The priority matrix of operators
        short ID[128];
        // The id of valid symbols
        Stack<char> symb;
        // The stack of operators
        Stack<T> numb;
        // The stack of numbers
};

template<typename T>
Calculator<T>::Calculator(){
    memset(ID, -1, sizeof(ID));
    ID['+'] = 0, ID['-'] = 0;
    ID['*'] = 1, ID['/'] = 1;
    ID['('] = 2, ID[')'] = 3;
    ID['['] = 2, ID[']'] = 3, ID['{'] = 2, ID['}'] = 3;
}

template<typename T>
T Calculator<T>::run(){
    numb.clear();
    symb.clear();
    bool lastIsNum = false;
    bool isNegative = false;
    char x = getchar();
    while (x != EOF && x != '\n' && x != '#'){
        if (x == ' '){ // Ignore space
            x = getchar();
            continue;
        }
        if (isNum(x)){ // Todo: co == 1 has not considered yet!!(OK)
            numb.push(getNum(x, isNegative));
            isNegative = false;
            lastIsNum = true;
        } 
        else if (isSymbol(x)){
            if (!lastIsNum && x == '-' && !isNegative){
                // If "-" means negative but not minus
                isNegative = true;
                x = getchar();
                continue;
            }
            if (!symb.empty()){
                char pre = symb.top();
                while (!symb.empty() && PRORTY[ID[pre]][ID[x]] == 1){
                    // If the top operator(pre) of the stack is prior to x,
                    // then calOnce()
                    calOnce();
                    if (!symb.empty()){ pre = symb.top(); }
                }
                if (PRORTY[ID[pre]][ID[x]] == 0) { symb.pop(); }
                // If the right parenthesis meets the left one,
                // then pop the symbol stack once and ignore x
                else { symb.push(x); }
            }
            else { symb.push(x); }
            if (ID[x] != 3) { lastIsNum = false; }
            // Right parenthesis is not seemed as an operator
            isNegative = false;
        } 
        else { throw invalid_argument { "Wrong symbol" }; }
        x = getchar();
    }
    while (!symb.empty()) { calOnce(); }
    return numb.top();// Todo: need to clear the stack!!(OK)
}

template<typename T>
bool Calculator<T>::isNumber(char x) const{
    return ((x >= '0' && x <= '9')) ? true : false;
}

template<>
bool Calculator<Polynomial>::isNum(char x) const{
    return ((x >= '0' && x <= '9') || x == 'x') ? true : false;
}

template<typename T>
bool Calculator<T>::isNum(char x) const{
    return ((x >= '0' && x <= '9')) ? true : false;
}

template<typename T>
bool Calculator<T>::isSymbol(char x) const{
    return (ID[x] == -1) ? false : true;
}

template<typename T>
int Calculator<T>::getInteger(char ch, bool isNegative) const{
    int res = 0;
    while (isNumber(ch)){
        res = res * 10 + ch -'0';
        ch = getchar();
    }
    ungetc(ch, stdin);
    return (isNegative) ? -res : res;
}

template<typename T>
double Calculator<T>::getDouble(char ch, bool isNegative) const{
    int integer = getInteger(ch, false);
    // Get the integer part
    double decimal = 0;
    ch = getchar();
    if (ch == '.'){
        ch = getchar();
        double flag = 0.1;
        while (isNumber(ch)){
            decimal += flag * (ch - '0');
            flag /= 10;
            ch = getchar();
        }
    }
    // Get the decimal part
    ungetc(ch, stdin);
    double res = static_cast<double> (integer) + decimal;
    return (isNegative) ? -res : res;
}

template<>
int Calculator<int>::getNum(char ch, bool isNegative) const{
    return getInteger(ch, isNegative);
}

template<>
double Calculator<double>::getNum(char ch, bool isNegative) const{
    return getDouble(ch, isNegative);
}

template<>
Polynomial Calculator<Polynomial>::getNum(char ch, bool isNegative) const{
    double co = getDouble(ch, isNegative);
    if (co == 0) { co = (isNegative) ? -1 : 1; }
    ch = getchar();
    if (ch != 'x'){
        Item* resItem = new Item(0, co);
        ungetc(ch, stdin);
        return { resItem };
    }
    ch = getchar();
    if (ch != '^'){
        Item* resItem = new Item(1, co);
        ungetc(ch, stdin);
        return { resItem };
    }
    ch = getchar();
    if (ch == '-'){
        // This "-" is for exponent
        isNegative = true;
        ch = getchar();
    }
    else {
        isNegative = false;
    }
    int ex = getInteger(ch, isNegative);
    Item* resItem = new Item(ex, co);
    return { resItem };
}

template<>
Polynomial Calculator<Polynomial>::safeDivider(Polynomial num1, Polynomial num2) const{
    throw invalid_argument { "Wrong symbol" };
    // Operator "/" in polynomial is undefined
}

template<typename T>
T Calculator<T>::safeDivider(T num1, T num2) const{
    if (num2 == 0){
        throw invalid_argument { "Divided by zero" };
    }
    return num1 / num2;
}

template<typename T>
void Calculator<T>::calOnce(){
    if (numb.size() < 2 || symb.empty()){
        throw invalid_argument { "Empty stack" };
    }
    T num2 = numb.top(); numb.pop();
    T num1 = numb.top(); numb.pop();
    char sym = symb.top(); symb.pop();
    T res = 0;
    switch (sym){
    case '+':
        res = num1 + num2;
        break;
    case '-':
        res = num1 - num2;
        break;
    case '*':
        res = num1 * num2;
        break;
    case '/':// Todo: Poly's "/" has not been considered yet!!!(OK)
        res = safeDivider(num1, num2);
        break;
    default:
        throw invalid_argument { "Wrong symbol" };
        break;
    }
    numb.push(res);
}
/*
There's a voice I hear inside my silence
Telling me that I can't let life
Just leave me dry
I gotta try
So I'll live with an open heart
And I'll show you every part
Every secret that I hold
Waiting to unfold
And as the shadows of yesterday
Begin to fall away
As I look at the rising sun
I know I have just begun
Just begun
--from Open Heart by Mazare / Keepsake / Liel Kolet
*/