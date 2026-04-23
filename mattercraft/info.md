====Mattercraft ARDI Library====

This library allows the use of ARDI live data in Mattercraft 3D/XR experiences.

===Using===

Add the **ARDIServer** behaviour to an object within the scene.

Set the appropriate server URL and site name.

Next, add an **ARDIBinding** behaviour on any objects inside the scene that you'd like to respond to live data. When new data arrives, it will be copied into a chosen Javascript property.

For example, a 3D text object might have the following binding...

PROPERTY: text.value
POINT: Paint Line.Speed - Actual

This means that the _value of the text_ is directly set by the _paint line speed_.

===Scaling/Conversion===

You can set the **mode** and the optional parameters (alpha, beta, gamma and delta) to alter exactly how the value is transferred to the property.

==0: Pure Copy==

A mode of zero simply copies the data without other manipulation.

==1: Scaling==

This scales the incoming value. Alpha and Beta define how large you expect the _incoming_ data to be, while Gamma and Delta are how large the _written_ value should be.

For example, an alpha of 0 and beta of 100 along with a gamma of 0 and delta of 1 will scale a 0-100 value to a 0-1 value.

==2: Text==

This is designed to be used when copying the value to text objects.

The Alpha value determines the number of decimal places to use. Ie. an alpha of 2 would give the value down to 2 decimal places.