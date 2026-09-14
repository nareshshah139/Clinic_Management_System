import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PurchaseProductDetails } from '@/components/pharmacy/PurchaseProductDetails';

const choose = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
describe('Invoice product details', () => {
  it('requires an explicit kind and saves a cosmetic without invented clinical values', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    render(<PurchaseProductDetails id="new" disabled={false} onSave={save} />);
    expect(screen.getByRole('button', { name: 'Save new product' })).toBeDisabled();
    choose('Product kind', 'COSMETIC');
    fireEvent.click(screen.getByRole('button', { name: 'Save new product' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ productKind: 'COSMETIC', category: 'Cosmetic', composition1: '', dosageForm: '', strength: '', requiresPrescription: false }));
    expect(await screen.findByRole('status')).toHaveTextContent('Product details saved');
  });
  it('requires actual medicine fields and an explicit prescription choice', () => {
    render(<PurchaseProductDetails id="medicine" disabled={false} onSave={jest.fn()} />);
    choose('Product kind', 'MEDICINE');
    for (const [name,value] of [['Category (required)','Test category'],['Composition (required)','Test ingredient'],['Dosage form (required)','Cream'],['Strength (required)','Review strength']]) choose(name,value);
    choose('Prescription required','false');
    expect(screen.getByRole('button', { name: 'Save new product' })).toBeDisabled();
    choose('Strength (required)','1%');
    expect(screen.getByRole('button', { name: 'Save new product' })).toBeEnabled();
  });
  it('clears inherited medicine defaults when correcting an existing cosmetic', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    render(<PurchaseProductDetails id="old" disabled={false} onSave={save} product={{ type: 'allopathy', composition1: 'Brand from OCR', category: 'Uncategorized', dosageForm: 'Tablet', strength: 'Review strength' }} />);
    choose('Product kind','COSMETIC');
    expect(screen.getByLabelText('Product form (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Strength (optional)')).toHaveValue('');
    fireEvent.click(screen.getByRole('button',{name:'Save product details'}));
    await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({productKind:'COSMETIC', composition1:'', dosageForm:'', strength:'',requiresPrescription:false})));
  });
  it('prevents duplicate saves and keeps entered values available after failure', async () => {
    let finish!: (message: string) => void;
    const save=jest.fn(()=>new Promise<string>(resolve=>{finish=resolve;}));
    render(<PurchaseProductDetails id="failure" disabled={false} onSave={save} />);
    choose('Product kind','CONSUMABLE');
    const button=screen.getByRole('button',{name:'Save new product'});
    fireEvent.click(button);fireEvent.click(button);
    expect(save).toHaveBeenCalledTimes(1);
    finish('Could not save product');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save product');
    expect(screen.getByLabelText('Product kind')).toHaveValue('CONSUMABLE');
    expect(screen.getByRole('button',{name:'Save new product'})).toBeEnabled();
  });
});
