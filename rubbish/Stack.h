#pragma once
#include <iostream>
#include <exception>
#include <cstddef>
using namespace std;

// This header is a simplified version of <stack> in STL
// (cuz we r not allowed to use STL lmaoooooo)
// All the methods work just same as STL

template<typename T>
class Stack{
    public:
        Stack() = default;
        ~Stack() = default;
        void push(T data);
        // Throws:
        //    out_of_range when the size of stack is over 1000000
        void pop();
        void clear();
        bool empty() const;
        size_t size() const;
        T top() const;
        // Throws:
        //    out_of_range when the stack is empty
    private:
        static const size_t MSIZE = 1000000;
        size_t m_size = 0;
        T m_data[MSIZE];
};

template <typename T>
void Stack<T>::push(T data){
    if (m_size == MSIZE){
        throw out_of_range { "Stack overflow" };
    }
    m_data[m_size ++] = data;
}

template <typename T>
void Stack<T>::pop(){
    if (m_size > 0){
        -- m_size;
    }
}

template<typename T>
void Stack<T>::clear(){
    m_size = 0;
}

template <typename T>
T Stack<T>::top() const{
    if (m_size == 0){
        throw out_of_range { "Empty stack" };
    }
    return m_data[m_size - 1];
}

template <typename T>
bool Stack<T>::empty() const{
    return m_size == 0;
}

template <typename T>
size_t Stack<T>::size() const{
    return m_size;
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