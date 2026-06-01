#pragma once
#include "header.h"
using namespace std;

const double FLAG = 1e-6;
// Two decimals equal when their difference less than FLAG = 10^-6;

double qpow(double base, int k);
// Parameters:
//    int k: exponent, k could be negative

struct Item{
    int exponent;
    double coefficient;
    Item* nxt;
    Item(int ex, double co) : exponent { ex }, coefficient { co },
        nxt { nullptr } {}
};

class Polynomial{
    public:
        Polynomial();
        Polynomial(Item* head);
        Polynomial(const Polynomial& other);
        ~Polynomial();
        void print() const;
        // Print the polynomial in two formats
        double getValue(double x) const;
        // Return the value when the variable is x
        void differentiate();
        // Replace Fx to the derivative of Fx and print
        Polynomial& operator=(const Polynomial& other);
        Polynomial operator+(const Polynomial& other) const;
        Polynomial operator-(const Polynomial& other) const;
        Polynomial operator*(const Polynomial& other) const;
        Polynomial operator/(const Polynomial& other) = delete;
    private:
        Item* m_head;
        // Store polynomials as a list,
        // sorted by exponent from large to small
        size_t m_size;
        // The size of the list
};
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