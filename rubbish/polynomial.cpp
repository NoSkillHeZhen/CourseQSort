#include "polynomial.h"
using namespace std;

double qpow(double base, int k){
    bool isNegative = false;
    if (k < 0){
        isNegative = true;
        k = -k;
    }
    double res = 1;
    while (k){
        if (k & 1) { res *= base; }
        base *= base;
        k >>= 1;
    }
    return (isNegative) ? 1 / res : res;
}

Polynomial::Polynomial() : m_head { nullptr }, m_size {0} {}

Polynomial::Polynomial(Item* head){
    m_head = nullptr;
    Item* ptr1 = m_head;
    Item* last = nullptr;
    Item* ptr2 = head;
    size_t size = 0;
    while (ptr2 != nullptr){
        ptr1 = new Item(ptr2->exponent, ptr2->coefficient);
        if (m_head == nullptr){
            m_head = ptr1;
        }
        else {
            last->nxt = ptr1;
        }
        last = ptr1;
        ptr2 = ptr2->nxt;
        ++ size;
    }
    m_size = size;
}

Polynomial::Polynomial(const Polynomial& other) : Polynomial(other.m_head){}

Polynomial::~Polynomial(){
    Item* now = m_head;
    while (now != nullptr){
        Item* nxt = now->nxt;
        delete now;
        now = nxt;
    }
    m_head = nullptr;
}

void Polynomial::print() const{
    cout << '\n' << "Format 1: ";
    if (m_head == nullptr){
        cout << "0";
    }
    else {
        Item* now = m_head;
        while (now != nullptr){
            if (now->exponent != 0){
                if (now->coefficient == -1){
                    cout << "-";
                }
                else if (now->coefficient != 1){
                    cout << now->coefficient;
                }
                cout << "x";
                if (now->exponent != 1) { cout << "^" << now->exponent; }
            }
            else {
                cout << now->coefficient;
            }
            if (now->nxt != nullptr) { cout << " + "; };
            now = now->nxt;
        }
    }
    cout << '\n' << "Format 2: ";
    cout << m_size << " ";
    Item* now = m_head;
    while (now != nullptr){
        cout << now->coefficient << " " << now->exponent << " ";
        now = now->nxt;
    }
    cout << '\n';
}

double Polynomial::getValue(double x) const{
    double res = 0;
    Item* now = m_head;
    while (now != nullptr){
        double value = now->coefficient * qpow(x, now->exponent);
        res += value;
        now = now->nxt;
    }
    return res;
}

void Polynomial::differentiate(){
    Item* now = m_head;
    Item* last = nullptr;
    while (now != nullptr){
        Item* tmp = now->nxt;
        if (now->exponent == 0){
            if (last != nullptr){
                last->nxt = tmp;
            }
            else {
                m_head = tmp;
            }
            -- m_size;
            delete now;
            now = nullptr;
        }
        else {
            now->coefficient *= now->exponent;
            -- now->exponent;
        }
        last = now;
        now = tmp;
    }
}

Polynomial& Polynomial::operator=(const Polynomial& other){
    if (this == &other){
        return *this;
    }
    Item* now = m_head;
    while (now != nullptr){
        Item* nxt = now->nxt;
        delete now;
        now = nxt;
    }
    m_head = nullptr;
    m_size = other.m_size;
    Item* ptr1 = m_head;
    Item* last = nullptr;
    Item* ptr2 = other.m_head;
    while (ptr2 != nullptr){
        ptr1 = new Item(ptr2->exponent, ptr2->coefficient);
        if (m_head == nullptr){
            m_head = ptr1;
        }
        else {
            last->nxt = ptr1;
        }
        last = ptr1;
        ptr2 = ptr2->nxt;
    }
    return *this;
}

Polynomial Polynomial::operator+(const Polynomial& other) const{
    // This function works similar as merging two sorted list
    Item* itemA = m_head;
    Item* itemB = other.m_head;
    Item* resHead = nullptr;
    Item* itemLast = nullptr;
    while (itemA != nullptr || itemB != nullptr){
        Item* itemNow = nullptr;
        if (itemA != nullptr && itemB != nullptr 
            && itemA->exponent == itemB->exponent){
            double newCo = itemA->coefficient + itemB->coefficient;
            if (abs(newCo - 0) > FLAG) itemNow = new Item(itemA->exponent, newCo);
            itemA = itemA->nxt;
            itemB = itemB->nxt;
        }
        else if (itemA != nullptr
            && (itemB == nullptr || itemA->exponent > itemB->exponent)){
            double newCo = itemA->coefficient;
            if (abs(newCo - 0) > FLAG) itemNow = new Item(itemA->exponent, newCo);
            itemA = itemA->nxt;
        }
        else {
            double newCo = itemB->coefficient;
            if (abs(newCo - 0) > FLAG) itemNow = new Item(itemB->exponent, newCo);
            itemB = itemB->nxt;
        }
        if (itemNow == nullptr) { continue; }; // New coefficient = 0
        if (resHead == nullptr){
            resHead = itemNow;
        }
        else {
            itemLast->nxt = itemNow;
        }
        itemLast = itemNow;
    }
    return { resHead };
}

Polynomial Polynomial::operator-(const Polynomial& other) const{
    // // This function works similar as "+"
    Item* itemA = m_head;
    Item* itemB = other.m_head;
    Item* resHead = nullptr;
    Item* itemLast = nullptr;
    while (itemA != nullptr || itemB != nullptr){
        Item* itemNow = nullptr;
        if (itemA != nullptr && itemB != nullptr 
            && itemA->exponent == itemB->exponent){
            double newCo = itemA->coefficient - itemB->coefficient;
            if (abs(newCo - 0) > FLAG) itemNow = new Item(itemA->exponent, newCo);
            itemA = itemA->nxt;
            itemB = itemB->nxt;
        }
        else if (itemA != nullptr
            && (itemB == nullptr || itemA->exponent > itemB->exponent)){
            double newCo = itemA->coefficient;
            if (abs(newCo - 0) > FLAG) itemNow = new Item(itemA->exponent, newCo);
            itemA = itemA->nxt;
        }
        else {
            double newCo = -(itemB->coefficient);
            if (abs(newCo - 0) > FLAG) itemNow = new Item(itemB->exponent, newCo);
            itemB = itemB->nxt;
        }
        if (itemNow == nullptr) { continue; };
        if (resHead == nullptr){
            resHead = itemNow;
        }
        else {
            itemLast->nxt = itemNow;
        }
        itemLast = itemNow;
    }
    return { resHead };
}

Polynomial Polynomial::operator*(const Polynomial& other) const{
    if (m_head == nullptr || other.m_head == nullptr){
        return { nullptr };
    }
    Item* itemA = m_head;
    Item* itemB = other.m_head;
    Polynomial res { nullptr };
    while (itemB != nullptr){
        Item* itemHead = nullptr;
        Item* itemLast = nullptr;
        Item* tmpA = itemA;
        while (tmpA != nullptr){
            Item* itemNow = nullptr;
            int newEx = tmpA->exponent + itemB->exponent;
            double newCo = tmpA->coefficient * itemB->coefficient;
            if (abs(newCo - 0) > FLAG) itemNow = new Item(newEx, newCo);
            tmpA = tmpA->nxt;
            if (itemNow == nullptr) { continue; };
            if (itemHead == nullptr){
                itemHead = itemNow;
            }
            else {
                itemLast->nxt = itemNow;
            }
            itemLast = itemNow;
        }
        // Create a new list of A * B[i], i = 0 ~ B.m_size - 1
        Polynomial newPoly { itemHead };
        res = res + newPoly;
        // Add up all A * B[i] to receive A * B
        itemB = itemB->nxt;
    }
    return res;
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